//! Pure, platform-independent document parsing primitives.
//!
//! Markdown, text-based PDF, and DOCX inputs share one source-ordered block and
//! protected-content contract. Image-only PDFs are rejected as OCR-required.

#![forbid(unsafe_code)]

use std::io::{Cursor, Read};
use std::path::Path;

use encoding_rs::{UTF_16BE, UTF_16LE};
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use quick_xml::events::Event as XmlEvent;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};

/// A parsed document in source order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParsedDocument {
    pub format: DocumentFormat,
    pub blocks: Vec<StructureBlock>,
    pub warnings: Vec<ParseWarning>,
}

/// Formats accepted by the document-import boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentFormat {
    Markdown,
    Pdf,
    Docx,
}

/// A semantic unit that has exactly one translation result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StructureBlock {
    pub id: String,
    pub kind: BlockKind,
    pub segments: Vec<Segment>,
}

/// Block-level structure retained for reading and export.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    Heading {
        level: u8,
    },
    Paragraph,
    ListItem,
    Quote,
    Code,
    /// One source-ordered row of a Markdown table.
    TableRow,
    /// A DOCX paragraph that appeared inside a table cell.
    TableCell,
}

/// Text sent to the translator or content that must remain byte-for-byte intact.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "text", rename_all = "snake_case")]
pub enum Segment {
    Translatable(String),
    Protected(String),
}

/// A best-effort condition that did not make parsing unsafe.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParseWarning {
    FormattingSimplified,
}

/// Stable classifications surfaced by import without exposing paths or bodies.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DocParseError {
    #[error("unsupported document format")]
    UnsupportedFormat,
    #[error("暂不支持")]
    OcrRequired,
    #[error("document is empty")]
    Empty,
    #[error("document encoding is invalid")]
    InvalidEncoding,
    #[error("document is corrupt")]
    Corrupt,
    #[error("document size {actual} exceeds limit {max}")]
    InputTooLarge { actual: usize, max: usize },
    #[error("parsed text size {actual} exceeds limit {max}")]
    TextTooLarge { actual: usize, max: usize },
}

/// Hard limits checked before and after parsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParseLimits {
    pub max_input_bytes: usize,
    pub max_text_chars: usize,
}
impl Default for ParseLimits {
    fn default() -> Self {
        Self {
            max_input_bytes: 52_428_800,
            max_text_chars: 100_000,
        }
    }
}
impl ParseLimits {
    /// Process-stable limits read once by the desktop app. Invalid overrides
    /// deliberately fall back instead of turning import into an outage.
    #[must_use]
    pub fn from_environment() -> Self {
        let defaults = Self::default();
        Self {
            max_input_bytes: positive_env("LINGOSTACK_DOCUMENT_MAX_FILE_BYTES")
                .unwrap_or(defaults.max_input_bytes),
            max_text_chars: positive_env("LINGOSTACK_DOCUMENT_MAX_TRANSLATABLE_CHARS")
                .unwrap_or(defaults.max_text_chars),
        }
    }
}

fn positive_env(name: &str) -> Option<usize> {
    std::env::var(name)
        .ok()?
        .parse::<usize>()
        .ok()
        .filter(|value| *value > 0)
}

/// Parse a document selected by its filename extension.
pub fn parse_document(
    path: &Path,
    bytes: &[u8],
    limits: ParseLimits,
) -> Result<ParsedDocument, DocParseError> {
    if bytes.len() > limits.max_input_bytes {
        return Err(DocParseError::InputTooLarge {
            actual: bytes.len(),
            max: limits.max_input_bytes,
        });
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "md" | "markdown" | "mdown" => parse_markdown(bytes, limits),
        "pdf" => parse_pdf(bytes, limits),
        "docx" => parse_docx(bytes, limits),
        _ => Err(DocParseError::UnsupportedFormat),
    }
}

/// Extract text from a text-based PDF. An image-only PDF is an explicit OCR
/// outcome; callers must surface the stable `暂不支持` message and never send it
/// to an LLM.
pub fn parse_pdf(bytes: &[u8], limits: ParseLimits) -> Result<ParsedDocument, DocParseError> {
    if bytes.len() > limits.max_input_bytes {
        return Err(DocParseError::InputTooLarge {
            actual: bytes.len(),
            max: limits.max_input_bytes,
        });
    }
    let text = pdf_extract::extract_text_from_mem(bytes).map_err(|_| DocParseError::Corrupt)?;
    if text.trim().is_empty() {
        return Err(DocParseError::OcrRequired);
    }
    if text.chars().count() > limits.max_text_chars {
        return Err(DocParseError::TextTooLarge {
            actual: text.chars().count(),
            max: limits.max_text_chars,
        });
    }
    let blocks = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .enumerate()
        .map(|(index, text)| StructureBlock {
            id: format!("block-{}", index + 1),
            kind: BlockKind::Paragraph,
            segments: vec![Segment::Translatable(text.to_owned())],
        })
        .collect::<Vec<_>>();
    Ok(ParsedDocument {
        format: DocumentFormat::Pdf,
        blocks,
        warnings: vec![ParseWarning::FormattingSimplified],
    })
}

/// Extract readable paragraph text from the OOXML document part. Hyperlinks and
/// field details are intentionally reduced to their displayed text; the source
/// file is never modified.
pub fn parse_docx(bytes: &[u8], limits: ParseLimits) -> Result<ParsedDocument, DocParseError> {
    if bytes.len() > limits.max_input_bytes {
        return Err(DocParseError::InputTooLarge {
            actual: bytes.len(),
            max: limits.max_input_bytes,
        });
    }
    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| DocParseError::Corrupt)?;
    let mut xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|_| DocParseError::Corrupt)?
        .read_to_string(&mut xml)
        .map_err(|_| DocParseError::Corrupt)?;
    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(false);
    let mut in_paragraph = false;
    let mut in_text = false;
    let mut in_table = 0_u32;
    let mut current_kind = BlockKind::Paragraph;
    let mut current_segments = Vec::new();
    let mut blocks = Vec::new();
    loop {
        match reader.read_event() {
            Ok(XmlEvent::Start(event)) => match event.local_name().as_ref() {
                b"p" => {
                    in_paragraph = true;
                    current_kind = if in_table > 0 {
                        BlockKind::TableCell
                    } else {
                        BlockKind::Paragraph
                    };
                    current_segments.clear();
                }
                b"tbl" => in_table += 1,
                b"pStyle" if in_paragraph && in_table == 0 => {
                    if let Some(style) = xml_attribute(&event, b"val") {
                        if let Some(level) = heading_style_level(&style) {
                            current_kind = BlockKind::Heading { level };
                        }
                    }
                }
                b"numPr" if in_paragraph && in_table == 0 => current_kind = BlockKind::ListItem,
                b"t" if in_paragraph => in_text = true,
                b"tab" if in_paragraph => {
                    push_segment(&mut current_segments, Segment::Translatable("\t".into()))
                }
                b"br" if in_paragraph => {
                    push_segment(&mut current_segments, Segment::Translatable("\n".into()))
                }
                b"docPr" if in_paragraph => {
                    push_docx_image_description(&mut current_segments, &event)
                }
                _ => {}
            },
            Ok(XmlEvent::End(event)) => match event.local_name().as_ref() {
                b"t" => in_text = false,
                b"p" => {
                    trim_segments(&mut current_segments);
                    if !current_segments.is_empty() {
                        blocks.push(StructureBlock {
                            id: format!("block-{}", blocks.len() + 1),
                            kind: current_kind,
                            segments: std::mem::take(&mut current_segments),
                        });
                    }
                    in_paragraph = false;
                }
                b"tbl" => in_table = in_table.saturating_sub(1),
                _ => {}
            },
            Ok(XmlEvent::Text(text)) if in_text => {
                push_segment(
                    &mut current_segments,
                    Segment::Translatable(
                        text.decode()
                            .map_err(|_| DocParseError::Corrupt)?
                            .into_owned(),
                    ),
                );
            }
            // quick-xml 0.41 emits XML references separately from text. Preserve
            // the user-visible text that older versions returned via unescape.
            Ok(XmlEvent::GeneralRef(reference)) if in_text => {
                push_segment(
                    &mut current_segments,
                    Segment::Translatable(resolve_xml_reference(&reference)?),
                );
            }
            Ok(XmlEvent::Empty(event)) => match event.local_name().as_ref() {
                b"pStyle" if in_paragraph && in_table == 0 => {
                    if let Some(style) = xml_attribute(&event, b"val") {
                        if let Some(level) = heading_style_level(&style) {
                            current_kind = BlockKind::Heading { level };
                        }
                    }
                }
                b"numPr" if in_paragraph && in_table == 0 => current_kind = BlockKind::ListItem,
                b"tab" if in_paragraph => {
                    push_segment(&mut current_segments, Segment::Translatable("\t".into()))
                }
                b"br" if in_paragraph => {
                    push_segment(&mut current_segments, Segment::Translatable("\n".into()))
                }
                b"docPr" if in_paragraph => {
                    push_docx_image_description(&mut current_segments, &event)
                }
                _ => {}
            },
            Ok(XmlEvent::Eof) => break,
            Err(_) => return Err(DocParseError::Corrupt),
            _ => {}
        }
    }
    if blocks.is_empty() {
        return Err(DocParseError::Empty);
    }
    let actual = text_char_count(&blocks);
    if actual > limits.max_text_chars {
        return Err(DocParseError::TextTooLarge {
            actual,
            max: limits.max_text_chars,
        });
    }
    Ok(ParsedDocument {
        format: DocumentFormat::Docx,
        blocks,
        warnings: vec![ParseWarning::FormattingSimplified],
    })
}

fn resolve_xml_reference(
    reference: &quick_xml::events::BytesRef<'_>,
) -> Result<String, DocParseError> {
    if let Some(character) = reference
        .resolve_char_ref()
        .map_err(|_| DocParseError::Corrupt)?
    {
        return Ok(character.to_string());
    }

    match reference
        .decode()
        .map_err(|_| DocParseError::Corrupt)?
        .as_ref()
    {
        "amp" => Ok("&".into()),
        "apos" => Ok("'".into()),
        "gt" => Ok(">".into()),
        "lt" => Ok("<".into()),
        "quot" => Ok("\"".into()),
        _ => Err(DocParseError::Corrupt),
    }
}

/// Parse CommonMark into source-ordered blocks and protected inline/code segments.
pub fn parse_markdown(bytes: &[u8], limits: ParseLimits) -> Result<ParsedDocument, DocParseError> {
    if bytes.len() > limits.max_input_bytes {
        return Err(DocParseError::InputTooLarge {
            actual: bytes.len(),
            max: limits.max_input_bytes,
        });
    }
    let source = decode_text(bytes)?;
    if source.trim().is_empty() {
        return Err(DocParseError::Empty);
    }
    if source.chars().count() > limits.max_text_chars {
        return Err(DocParseError::TextTooLarge {
            actual: source.chars().count(),
            max: limits.max_text_chars,
        });
    }
    let mut blocks = Vec::new();
    let mut current: Option<(BlockKind, Vec<Segment>)> = None;
    let mut code_buffer: Option<String> = None;
    let mut table_cell_count = 0_usize;
    let mut links = Vec::<ProtectedInline>::new();
    for event in Parser::new_ext(&source, Options::all()) {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                current = Some((
                    BlockKind::Heading {
                        level: heading_level(level),
                    },
                    Vec::new(),
                ))
            }
            Event::Start(Tag::Paragraph) if current.is_none() => {
                current = Some((BlockKind::Paragraph, Vec::new()))
            }
            Event::Start(Tag::Item) => current = Some((BlockKind::ListItem, Vec::new())),
            Event::Start(Tag::BlockQuote(_)) => current = Some((BlockKind::Quote, Vec::new())),
            Event::Start(Tag::CodeBlock(_)) => code_buffer = Some(String::new()),
            Event::Start(Tag::TableRow) => {
                current = Some((BlockKind::TableRow, Vec::new()));
                table_cell_count = 0;
            }
            Event::Start(Tag::TableHead) => {
                current = Some((BlockKind::TableRow, Vec::new()));
                table_cell_count = 0;
            }
            Event::Start(Tag::TableCell) => {
                if let Some((_, segments)) = &mut current {
                    if table_cell_count > 0 {
                        push_segment(segments, Segment::Translatable("\t".into()));
                    }
                    table_cell_count += 1;
                }
            }
            Event::Start(Tag::Link { dest_url, .. }) => {
                if let Some((_, segments)) = &mut current {
                    push_segment(segments, Segment::Protected("[".into()));
                }
                links.push(ProtectedInline::Link(dest_url.into_string()))
            }
            Event::Start(Tag::Image {
                dest_url, title, ..
            }) => {
                if let Some((_, segments)) = &mut current {
                    push_segment(segments, Segment::Protected("![".into()));
                }
                links.push(ProtectedInline::Image {
                    url: dest_url.into_string(),
                    title: title.into_string(),
                })
            }
            Event::Text(text) => {
                if let Some(code) = &mut code_buffer {
                    code.push_str(&text);
                } else if let Some((_, segments)) = &mut current {
                    push_segment(segments, Segment::Translatable(text.into_string()));
                }
            }
            Event::Code(text) => {
                if let Some((_, segments)) = &mut current {
                    push_segment(
                        segments,
                        Segment::Protected(format!("`{}`", text.into_string())),
                    );
                }
            }
            Event::Html(text) | Event::InlineHtml(text) => {
                if let Some((_, segments)) = &mut current {
                    push_segment(segments, Segment::Protected(text.into_string()));
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some((_, segments)) = &mut current {
                    push_segment(segments, Segment::Translatable("\n".into()));
                }
            }
            Event::End(TagEnd::Heading(_))
            | Event::End(TagEnd::Item)
            | Event::End(TagEnd::BlockQuote(_))
            | Event::End(TagEnd::TableRow)
            | Event::End(TagEnd::TableHead) => finish_block(&mut blocks, &mut current),
            Event::End(TagEnd::Paragraph) if matches!(current, Some((BlockKind::Paragraph, _))) => {
                finish_block(&mut blocks, &mut current)
            }
            Event::End(TagEnd::Link) | Event::End(TagEnd::Image) => {
                if let (Some(inline), Some((_, segments))) = (links.pop(), &mut current) {
                    push_segment(segments, Segment::Protected(inline.into_protected_text()));
                }
            }
            Event::End(TagEnd::CodeBlock) => {
                if let Some(text) = code_buffer.take() {
                    blocks.push(StructureBlock {
                        id: format!("block-{}", blocks.len() + 1),
                        kind: BlockKind::Code,
                        segments: vec![Segment::Protected(text)],
                    });
                }
            }
            _ => {}
        }
    }
    finish_block(&mut blocks, &mut current);
    if blocks.is_empty() {
        return Err(DocParseError::Empty);
    }
    Ok(ParsedDocument {
        format: DocumentFormat::Markdown,
        blocks,
        warnings: vec![ParseWarning::FormattingSimplified],
    })
}

#[derive(Debug)]
enum ProtectedInline {
    Link(String),
    Image { url: String, title: String },
}
impl ProtectedInline {
    fn into_protected_text(self) -> String {
        match self {
            Self::Link(url) => format!("]({url})"),
            Self::Image { url, title } if title.is_empty() => format!("]({url})"),
            Self::Image { url, title } => format!("]({url} \"{title}\")"),
        }
    }
}

fn heading_level(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}
fn finish_block(blocks: &mut Vec<StructureBlock>, current: &mut Option<(BlockKind, Vec<Segment>)>) {
    if let Some((kind, mut segments)) = current.take() {
        trim_segments(&mut segments);
        if !segments.is_empty() {
            blocks.push(StructureBlock {
                id: format!("block-{}", blocks.len() + 1),
                kind,
                segments,
            });
        }
    }
}
fn trim_segments(segments: &mut Vec<Segment>) {
    if let Some(Segment::Translatable(text)) = segments.first_mut() {
        *text = text.trim_start().to_owned();
    }
    if let Some(Segment::Translatable(text)) = segments.last_mut() {
        *text = text.trim_end().to_owned();
    }
    segments.retain(|segment| !matches!(segment, Segment::Translatable(text) if text.is_empty()));
}
fn push_segment(segments: &mut Vec<Segment>, next: Segment) {
    match (segments.last_mut(), next) {
        (Some(Segment::Translatable(previous)), Segment::Translatable(next)) => {
            previous.push_str(&next)
        }
        (Some(Segment::Protected(previous)), Segment::Protected(next)) => previous.push_str(&next),
        (_, next) => segments.push(next),
    }
}
fn text_char_count(blocks: &[StructureBlock]) -> usize {
    blocks
        .iter()
        .flat_map(|block| &block.segments)
        .map(|segment| match segment {
            Segment::Translatable(text) | Segment::Protected(text) => text.chars().count(),
        })
        .sum()
}
fn xml_attribute(event: &quick_xml::events::BytesStart<'_>, name: &[u8]) -> Option<String> {
    event.attributes().flatten().find_map(|attribute| {
        (attribute.key.local_name().as_ref() == name)
            .then(|| String::from_utf8_lossy(attribute.value.as_ref()).into_owned())
    })
}
fn heading_style_level(style: &str) -> Option<u8> {
    let normalized = style.to_ascii_lowercase().replace(' ', "");
    normalized
        .strip_prefix("heading")?
        .parse::<u8>()
        .ok()
        .filter(|level| (1..=6).contains(level))
}
fn push_docx_image_description(
    segments: &mut Vec<Segment>,
    event: &quick_xml::events::BytesStart<'_>,
) {
    let title = xml_attribute(event, b"title").unwrap_or_default();
    let description = xml_attribute(event, b"descr").unwrap_or_default();
    let summary = match (title.trim(), description.trim()) {
        ("", "") => return,
        ("", description) => format!("[image: {description}]"),
        (title, "") => format!("[image: {title}]"),
        (title, description) => format!("[image: {title}; {description}]"),
    };
    push_segment(segments, Segment::Protected(summary));
}
fn decode_text(bytes: &[u8]) -> Result<String, DocParseError> {
    if bytes.starts_with(&[0xff, 0xfe]) {
        let (text, _, malformed) = UTF_16LE.decode(&bytes[2..]);
        if malformed {
            Err(DocParseError::InvalidEncoding)
        } else {
            Ok(text.into_owned())
        }
    } else if bytes.starts_with(&[0xfe, 0xff]) {
        let (text, _, malformed) = UTF_16BE.decode(&bytes[2..]);
        if malformed {
            Err(DocParseError::InvalidEncoding)
        } else {
            Ok(text.into_owned())
        }
    } else {
        std::str::from_utf8(bytes)
            .map(str::to_owned)
            .map_err(|_| DocParseError::InvalidEncoding)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    #[test]
    fn default_limits_match_product_recommendation() {
        assert_eq!(ParseLimits::default().max_input_bytes, 52_428_800);
        assert_eq!(ParseLimits::default().max_text_chars, 100_000);
    }
    #[test]
    fn markdown_preserves_inline_and_fenced_code() {
        let parsed = parse_markdown(
            b"# Title\n\nUse `cargo test`.\n\n```rs\nfn main() {}\n```\n",
            ParseLimits::default(),
        )
        .unwrap();
        assert_eq!(parsed.blocks.len(), 3);
        assert_eq!(parsed.blocks[0].kind, BlockKind::Heading { level: 1 });
        assert!(
            matches!(&parsed.blocks[1].segments[1], Segment::Protected(text) if text == "`cargo test`")
        );
        assert_eq!(
            parsed.blocks[2].segments,
            vec![Segment::Protected("fn main() {}\n".into())]
        );
    }
    #[test]
    fn utf16_markdown_is_decoded() {
        let mut bytes = vec![0xff, 0xfe];
        bytes.extend("hello".encode_utf16().flat_map(u16::to_le_bytes));
        assert_eq!(
            parse_markdown(&bytes, ParseLimits::default())
                .unwrap()
                .blocks
                .len(),
            1
        );
    }
    #[test]
    fn invalid_encoding_and_limits_are_stable() {
        assert_eq!(
            parse_markdown(&[0xff], ParseLimits::default()).unwrap_err(),
            DocParseError::InvalidEncoding
        );
        assert_eq!(
            parse_markdown(
                b"abc",
                ParseLimits {
                    max_input_bytes: 2,
                    max_text_chars: 20
                }
            )
            .unwrap_err(),
            DocParseError::InputTooLarge { actual: 3, max: 2 }
        );
    }

    #[test]
    fn markdown_fixture_preserves_urls_images_tables_and_code_as_semantic_blocks() {
        let parsed = parse_markdown(
            include_bytes!("../tests/fixtures/markdown/semantic.md"),
            ParseLimits::default(),
        )
        .unwrap();
        assert_eq!(parsed.blocks[0].kind, BlockKind::Heading { level: 1 });
        assert!(parsed
            .blocks
            .iter()
            .any(|block| block.kind == BlockKind::ListItem));
        assert_eq!(
            parsed
                .blocks
                .iter()
                .filter(|block| block.kind == BlockKind::TableRow)
                .count(),
            2
        );
        let paragraph = &parsed.blocks[1].segments;
        assert!(paragraph.iter().any(|segment| {
            matches!(segment, Segment::Protected(value) if value == "](https://example.test/docs)")
        }));
        let image = parsed
            .blocks
            .iter()
            .find(|block| block.segments.iter().any(|segment| matches!(segment, Segment::Protected(value) if value.contains("architecture.png"))))
            .unwrap();
        assert!(image.segments.iter().any(|segment| {
            matches!(segment, Segment::Translatable(value) if value.contains("Architecture diagram"))
        }));
        assert!(matches!(
            parsed.blocks.last().unwrap().segments.as_slice(),
            [Segment::Protected(code)] if code.contains("println")
        ));
    }

    #[test]
    fn pdf_fixture_distinguishes_readable_empty_and_corrupt_inputs() {
        let parsed = parse_pdf(&pdf_fixture(Some("Hello PDF")), ParseLimits::default()).unwrap();
        assert_eq!(parsed.format, DocumentFormat::Pdf);
        assert_eq!(
            parsed.blocks[0].segments,
            vec![Segment::Translatable("Hello PDF".into())]
        );
        assert_eq!(
            parse_pdf(&pdf_fixture(None), ParseLimits::default()).unwrap_err(),
            DocParseError::OcrRequired
        );
        assert_eq!(
            parse_pdf(b"not a PDF", ParseLimits::default()).unwrap_err(),
            DocParseError::Corrupt
        );
        let truncated = pdf_fixture(Some("Hello PDF"));
        assert_eq!(
            parse_pdf(&truncated[..truncated.len() - 24], ParseLimits::default()).unwrap_err(),
            DocParseError::Corrupt
        );
    }

    #[test]
    fn docx_fixture_preserves_source_order_and_image_descriptions() {
        let parsed = parse_docx(&docx_fixture(DOCX_SEMANTIC_XML), ParseLimits::default()).unwrap();
        assert_eq!(
            parsed
                .blocks
                .iter()
                .map(|block| block.kind)
                .collect::<Vec<_>>(),
            vec![
                BlockKind::Heading { level: 1 },
                BlockKind::Paragraph,
                BlockKind::ListItem,
                BlockKind::TableCell,
                BlockKind::TableCell,
                BlockKind::Paragraph,
            ]
        );
        assert_eq!(
            parsed.blocks[1].segments,
            vec![Segment::Translatable("Visible hyperlink text".into())]
        );
        assert!(parsed.blocks[5].segments.iter().any(|segment| {
            matches!(segment, Segment::Protected(value) if value == "[image: Architecture; System diagram]")
        }));
    }

    #[test]
    fn docx_text_entities_are_extracted_as_displayed_text() {
        let parsed = parse_docx(
            &docx_fixture(
                r#"<w:document><w:body><w:p><w:r><w:t>Tom &amp; Jerry</w:t></w:r></w:p></w:body></w:document>"#,
            ),
            ParseLimits::default(),
        )
        .unwrap();

        assert_eq!(
            parsed.blocks[0].segments,
            vec![Segment::Translatable("Tom & Jerry".into())]
        );
    }

    #[test]
    fn docx_empty_and_damaged_packages_are_rejected() {
        assert_eq!(
            parse_docx(&docx_fixture(EMPTY_DOCX_XML), ParseLimits::default()).unwrap_err(),
            DocParseError::Empty
        );
        assert_eq!(
            parse_docx(b"not a zip", ParseLimits::default()).unwrap_err(),
            DocParseError::Corrupt
        );
        assert_eq!(
            parse_docx(&zip_without_document_xml(), ParseLimits::default()).unwrap_err(),
            DocParseError::Corrupt
        );
        assert_eq!(
            parse_docx(&docx_fixture("<w:document"), ParseLimits::default()).unwrap_err(),
            DocParseError::Corrupt
        );
    }

    #[test]
    fn parsed_text_limit_counts_protected_content() {
        assert_eq!(
            parse_markdown(
                b"`protected`",
                ParseLimits {
                    max_input_bytes: 100,
                    max_text_chars: 3
                },
            )
            .unwrap_err(),
            DocParseError::TextTooLarge { actual: 11, max: 3 }
        );
    }

    fn pdf_fixture(text: Option<&str>) -> Vec<u8> {
        let stream = text
            .map(|value| format!("BT /F1 12 Tf 72 720 Td ({value}) Tj ET"))
            .unwrap_or_default();
        let objects = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_owned(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_owned(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".to_owned(),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_owned(),
            format!("<< /Length {} >>\nstream\n{stream}\nendstream", stream.len()),
        ];
        let mut bytes = b"%PDF-1.4\n".to_vec();
        let mut offsets = vec![0_usize];
        for (index, object) in objects.iter().enumerate() {
            offsets.push(bytes.len());
            bytes.extend_from_slice(format!("{} 0 obj\n{object}\nendobj\n", index + 1).as_bytes());
        }
        let xref = bytes.len();
        bytes.extend_from_slice(
            format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes(),
        );
        for offset in offsets.iter().skip(1) {
            bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
        }
        bytes.extend_from_slice(
            format!(
                "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
                objects.len() + 1
            )
            .as_bytes(),
        );
        bytes
    }

    fn docx_fixture(document_xml: &str) -> Vec<u8> {
        let mut cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(&mut cursor);
        writer
            .start_file("word/document.xml", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(document_xml.as_bytes()).unwrap();
        writer.finish().unwrap();
        cursor.into_inner()
    }

    fn zip_without_document_xml() -> Vec<u8> {
        let mut cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(&mut cursor);
        writer
            .start_file("[Content_Types].xml", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"<Types/>").unwrap();
        writer.finish().unwrap();
        cursor.into_inner()
    }

    const EMPTY_DOCX_XML: &str = r#"<w:document xmlns:w="urn:w"><w:body/></w:document>"#;
    const DOCX_SEMANTIC_XML: &str = r#"<w:document xmlns:w="urn:w" xmlns:wp="urn:wp"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p>
      <w:p><w:hyperlink><w:r><w:t>Visible hyperlink text</w:t></w:r></w:hyperlink></w:p>
      <w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>List item</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell one</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell two</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:r><w:t>Picture </w:t></w:r><wp:docPr title="Architecture" descr="System diagram"/></w:p>
    </w:body></w:document>"#;
}

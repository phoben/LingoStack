//! JSON 数组流解析：把 `[{...},{...}]` 的流式响应切成逐个顶层对象。
//!
//! Gemini 的 `streamGenerateContent`（未加 `alt=sse` 时）不返回 SSE，而是一个
//! 持续写出的 JSON 数组——客户端需要在数组尚未闭合时就逐个取出已完整的元素。
//!
//! 解析策略：扫描字符维护括号深度，深度由 0→1 记为对象起点、回到 0 记为终点，
//! 并正确跳过字符串字面量内的括号与转义字符（否则 `{"text":"}"}` 会误判）。

use async_stream::stream;
use futures::stream::BoxStream;
use futures::{Stream, StreamExt};

use crate::utf8::Utf8Carry;
use crate::LlmError;

/// 跨 chunk 的数组流扫描状态。
#[derive(Default)]
struct Scanner {
    /// 当前累积的对象文本（仅在 depth > 0 时有内容）。
    buf: String,
    /// 花括号嵌套深度。
    depth: usize,
    /// 是否处于字符串字面量内。
    in_string: bool,
    /// 上一个字符是否为反斜杠转义。
    escaped: bool,
}

impl Scanner {
    /// 喂入一段文本，返回其中已完整的顶层 JSON 对象。
    fn push(&mut self, text: &str) -> Vec<String> {
        let mut out = Vec::new();
        for ch in text.chars() {
            if self.depth > 0 {
                self.buf.push(ch);
            }
            if self.in_string {
                if self.escaped {
                    self.escaped = false;
                } else if ch == '\\' {
                    self.escaped = true;
                } else if ch == '"' {
                    self.in_string = false;
                }
                continue;
            }
            match ch {
                '"' => self.in_string = true,
                '{' => {
                    if self.depth == 0 {
                        // 对象起点：buf 从这个 '{' 开始（上面的 push 因 depth==0 被跳过）。
                        self.buf.clear();
                        self.buf.push(ch);
                    }
                    self.depth += 1;
                }
                '}' => {
                    self.depth = self.depth.saturating_sub(1);
                    if self.depth == 0 && !self.buf.is_empty() {
                        out.push(std::mem::take(&mut self.buf));
                    }
                }
                _ => {}
            }
        }
        out
    }
}

/// 把「字节 chunk 流」解析为「顶层 JSON 对象文本流」。
///
/// 数组的 `[` / `,` / `]` 与其间空白被忽略；只产出完整对象。
/// 返回 [`BoxStream`]（`Unpin`），便于协议层直接 `next().await`。
pub fn parse_json_objects<S, B, E>(input: S) -> BoxStream<'static, Result<String, LlmError>>
where
    S: Stream<Item = Result<B, E>> + Send + Unpin + 'static,
    B: AsRef<[u8]> + Send + 'static,
    E: std::fmt::Display + Send + 'static,
{
    let mut input = input;
    let mut scanner = Scanner::default();
    let mut utf8 = Utf8Carry::default();
    stream! {
        while let Some(chunk) = input.next().await {
            match chunk {
                Ok(bytes) => match utf8.push(bytes.as_ref()) {
                    Ok(text) => {
                        for obj in scanner.push(&text) {
                            yield Ok(obj);
                        }
                    }
                    Err(message) => {
                        yield Err(LlmError::Stream(message));
                        return;
                    }
                },
                Err(e) => {
                    yield Err(LlmError::Stream(e.to_string()));
                    return;
                }
            }
        }
        if let Err(message) = utf8.finish() {
            yield Err(LlmError::Stream(message));
        }
    }
    .boxed()
}

#[cfg(test)]
mod tests {
    use super::*;

    type Chunk = Result<Vec<u8>, std::io::Error>;

    fn chunk(s: &str) -> Chunk {
        Ok(s.as_bytes().to_vec())
    }

    async fn collect_objs(stream: BoxStream<'static, Result<String, LlmError>>) -> Vec<String> {
        stream.filter_map(|r| async move { r.ok() }).collect().await
    }

    #[tokio::test]
    async fn parses_objects_from_complete_array() {
        let s = futures::stream::iter(vec![chunk("[{\"a\":1},{\"a\":2}]")]);
        assert_eq!(
            collect_objs(parse_json_objects(s)).await,
            vec!["{\"a\":1}".to_string(), "{\"a\":2}".to_string()]
        );
    }

    #[tokio::test]
    async fn emits_objects_before_array_closes() {
        // 数组尚未闭合，但首个对象已完整——必须立即产出（流式的意义所在）。
        let s = futures::stream::iter(vec![chunk("[{\"a\":1},")]);
        assert_eq!(
            collect_objs(parse_json_objects(s)).await,
            vec!["{\"a\":1}".to_string()]
        );
    }

    #[tokio::test]
    async fn handles_objects_split_across_chunks() {
        let s = futures::stream::iter(vec![chunk("[{\"a\""), chunk(":1},{\"b\":"), chunk("2}]")]);
        assert_eq!(
            collect_objs(parse_json_objects(s)).await,
            vec!["{\"a\":1}".to_string(), "{\"b\":2}".to_string()]
        );
    }

    #[tokio::test]
    async fn handles_nested_objects() {
        let s = futures::stream::iter(vec![chunk("[{\"a\":{\"b\":{\"c\":1}}}]")]);
        assert_eq!(
            collect_objs(parse_json_objects(s)).await,
            vec!["{\"a\":{\"b\":{\"c\":1}}}".to_string()]
        );
    }

    #[tokio::test]
    async fn ignores_braces_inside_strings() {
        // 字符串里的 } 不能被当成对象结束。
        let s = futures::stream::iter(vec![chunk("[{\"t\":\"a}b{c\"}]")]);
        assert_eq!(
            collect_objs(parse_json_objects(s)).await,
            vec!["{\"t\":\"a}b{c\"}".to_string()]
        );
    }

    #[tokio::test]
    async fn handles_escaped_quotes_in_strings() {
        // \" 不结束字符串；其后的 } 仍属字符串内容。
        let s = futures::stream::iter(vec![chunk("[{\"t\":\"say \\\"}\\\" ok\"}]")]);
        assert_eq!(
            collect_objs(parse_json_objects(s)).await,
            vec!["{\"t\":\"say \\\"}\\\" ok\"}".to_string()]
        );
    }

    #[tokio::test]
    async fn tolerates_pretty_printed_whitespace() {
        let s = futures::stream::iter(vec![chunk("[\n  {\n    \"a\": 1\n  },\n  {\"b\":2}\n]")]);
        let out = collect_objs(parse_json_objects(s)).await;
        assert_eq!(out.len(), 2);
        assert!(out[0].contains("\"a\""));
        assert!(out[1].contains("\"b\""));
    }

    #[tokio::test]
    async fn empty_array_yields_nothing() {
        let s = futures::stream::iter(vec![chunk("[]")]);
        assert!(collect_objs(parse_json_objects(s)).await.is_empty());
    }

    #[tokio::test]
    async fn yields_utf8_error_on_invalid_bytes() {
        let s = futures::stream::iter(vec![Ok::<Vec<u8>, std::io::Error>(vec![0xFF, 0xFE])]);
        let results: Vec<_> = parse_json_objects(s).collect().await;
        assert!(matches!(results[0], Err(LlmError::Stream(_))));
    }

    #[tokio::test]
    async fn propagates_upstream_error() {
        let s = futures::stream::iter(vec![Err::<Vec<u8>, std::io::Error>(std::io::Error::other(
            "connection reset",
        ))]);
        let results: Vec<_> = parse_json_objects(s).collect().await;
        assert!(matches!(results[0], Err(LlmError::Stream(_))));
    }

    #[tokio::test]
    async fn carries_multibyte_character_split_at_every_byte_boundary() {
        let text = "[{\"text\":\"中\"}]";
        let marker = text.find('中').unwrap();
        for split in 1..'中'.len_utf8() {
            let byte = marker + split;
            let s = futures::stream::iter(vec![
                Ok::<Vec<u8>, std::io::Error>(text.as_bytes()[..byte].to_vec()),
                Ok(text.as_bytes()[byte..].to_vec()),
            ]);
            assert_eq!(
                collect_objs(parse_json_objects(s)).await,
                vec!["{\"text\":\"中\"}".to_string()],
                "split {split}"
            );
        }
    }

    #[tokio::test]
    async fn yields_utf8_error_when_stream_ends_mid_character() {
        let bytes = "[{\"text\":\"中".as_bytes();
        let s = futures::stream::iter(vec![Ok::<Vec<u8>, std::io::Error>(
            bytes[..bytes.len() - 1].to_vec(),
        )]);
        let results: Vec<_> = parse_json_objects(s).collect().await;
        assert!(matches!(results[0], Err(LlmError::Stream(_))));
    }
}

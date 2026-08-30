# lingostack-docparse 开发规范

路径：`crates/lingostack-docparse`。

该 crate 是平台无关的文档解析 module。Markdown、文本型 PDF 与 DOCX 统一输出源顺序语义块；`lingostack-document` 再把块转换成规范化 Markdown 并作为内部翻译片段持久化。Tauri 与 React 不得重新解析源格式。

## 已实现 interface

```rust
fn parse_document(path: &Path, bytes: &[u8], limits: ParseLimits)
    -> Result<ParsedDocument, DocParseError>;
```

- `ParsedDocument`：格式、按源顺序排列的 `StructureBlock`、非阻断 warning。
- `StructureBlock`：稳定 id、`BlockKind`、`Segment::{Translatable, Protected}`。
- `BlockKind`：heading、paragraph、list item、quote、code、table row/cell。
- `ParseLimits`：默认 50 MiB / 100,000 可翻译字符；环境变量只接受正整数。
- `DocParseError`：unsupported、OCR required（精确显示“暂不支持”）、empty、invalid encoding、corrupt、input/text too large。

## Markdown 语义契约

- 行内代码连同反引号、代码块正文、链接/图片的 Markdown 定界符与 URL 属于 protected content。
- 链接/图片可见文字可翻译；URL 不得翻译、删除或重排。
- Markdown 表格按表头/行的源顺序产生 table-row 块，供 document module 合成为有效 GFM。
- DOCX 保留标题、列表、段落、表格单元、超链可见文字和图片 alt/title；PDF 只保证提取顺序，不保证版式。
- 图片存在不等于 OCR；只有没有可提取正文且需要图像识别的 PDF 返回 `OcrRequired`。

## 错误与隐私

- 解析前检查源字节上限，解析后检查可翻译字符上限；超限不得触发模型请求。
- 错误不得包含绝对路径、源正文或源文件二进制。
- 空文档、损坏文档与扫描文档必须保持可区分，不能统一为一般解析失败。

## Tests required

- Markdown：标题、列表、引用、GFM 表格、行内/围栏代码、链接、图片、UTF-8/UTF-16、无效编码、空文档与上限。
- PDF：文本、空白/image-only、截断/损坏 fixture。
- DOCX：标题、列表、段落、表格、超链、图片说明、空包/坏 ZIP/缺 XML/坏 XML fixture。
- 断言必须检查语义块种类、源顺序和 protected delimiters，而不是只检查“提取到一些文字”。

## Wrong vs Correct

```rust
// Wrong: 丢失 URL 定界符，后续无法重建 Markdown。
Segment::Protected(url)

// Correct: 开始/结束定界符和 URL 都受保护，可见文字仍可翻译。
Segment::Protected("[".into());
Segment::Translatable(label);
Segment::Protected(format!("]({url})"));
```

验证：

```powershell
cargo test -p lingostack-docparse
cargo clippy -p lingostack-docparse --all-targets -- -D warnings
cargo fmt --all --check
```

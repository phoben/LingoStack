# 流式解析

两个解码器，签名同形，都返回 `BoxStream<'static, Result<String, LlmError>>`，泛型接受任意字节流：

```rust
pub fn parse_data_lines<S, B, E>(input: S) -> BoxStream<'static, Result<String, LlmError>>
where S: Stream<Item = Result<B, E>> + Send + Unpin + 'static, B: AsRef<[u8]>, E: Display
```

| 解码器 | 文件 | 用于 |
|--------|------|------|
| `parse_data_lines` | `sse.rs:19-24` | OpenAI（`openai.rs:138`）、Anthropic（`anthropic.rs:174`） |
| `parse_json_objects` | `json_array_stream.rs:73-78` | 仅 Gemini（`gemini.rs:201`） |

## SSE 解码

`sse.rs`：

- 跨 chunk 维护一个 `String` 缓冲（`:26`），因为一个 SSE 事件可能被 TCP 切在任意位置
- 反复查找 `"\n\n"` 事件边界，取出完整块处理（`:32-45`）
- 只 yield `data:` 开头的行（`strip_prefix("data:")` + `trim()`），其他字段（`event:` / `id:` / `:` 注释）静默忽略（`:37-43`）
- **终止**：`payload == "[DONE]"` 显式跳过不 yield（`:39-41`），随后底层字节流自然结束

## JSON 数组解码

Gemini 的 `streamGenerateContent`（未加 `alt=sse`）返回的是**增量写入的裸 JSON 数组** `[{...},{...}]`，不是 SSE。

`json_array_stream.rs` 用手写字符扫描器（`struct Scanner { buf, depth, in_string, escaped }`，`:16-26`）逐字符跟踪花括号深度与字符串字面量状态，这样在外层 `]` 还没到达时就能识别出一个完整的顶层 `{...}` 对象（理由见 `:1-7`）。

正确处理字符串内的花括号与 `\"` 转义——有专门测试。

**终止**：靠上游流结束 + 深度归零。没有 `[DONE]` 等价物，也不特判 `]`。空数组 `[]` 什么都不 yield（有测试）。

## 错误传播

两个解码器的错误处理完全一致：

- UTF-8 解码失败 → `yield Err(LlmError::Stream(...)); return;`（`sse.rs:47-50`、`json_array_stream.rs:90-98`）
- 上游流报错 → `yield Err(LlmError::Stream(e.to_string())); return;`（`sse.rs:52-55`）

**首个错误即终止整个流**，不做部分恢复。

## payload 反序列化失败在上一层

解码器只管分帧，**不管 payload 是否匹配预期结构**。JSON 结构不符在各 provider 的 `chat_stream` 里报出：

```rust
serde_json::from_str(&payload)
    .map_err(|e| LlmError::Stream(format!("JSON 解析失败: {e}")))?
```

（`openai.rs:141-142`、`anthropic.rs:177-178`、`gemini.rs:204-205`）

因为在 `try_stream!` 里用 `?`，这个错误成为流的最后一项，流随即结束——**一个坏块杀死整条流**。三个 provider 各有 `surfaces_stream_json_error` 测试断言这个行为（结果向量只有一项且是错误）。

## 注意：`LlmError::Stream` 语义被复用

它同时表示两件事：

1. 传输层分帧损坏（坏 UTF-8、SSE 格式错乱）—— 来自解码器
2. payload 结构不符预期 —— 来自 provider 层

调用方无法区分，只能看错误文本。加新错误来源时，先想清楚是否该复用 `Stream` 还是加新变体。

## 改动解码器必须加分片测试

解码器的核心价值就是正确处理任意切分。既有测试用 `futures::stream::iter(vec![chunk("..."), ...])` 手工构造分片（helper `fn chunk()` 在 `sse.rs:69-71`、`json_array_stream.rs:111-113`），**不用 wiremock**：

- `handles_events_split_across_chunks`（`sse.rs:87-97`）
- `handles_objects_split_across_chunks`（`json_array_stream.rs:139-145`）
- `yields_utf8_error_on_invalid_bytes`、`propagates_upstream_error`

改缓冲逻辑时，必须补一个「在最坏位置切开」的用例。provider 层的 wiremock 测试是一次性投递整个字符串的，**抓不到分片 bug**。

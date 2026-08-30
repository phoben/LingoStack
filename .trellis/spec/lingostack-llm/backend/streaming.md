# 流式解析

两个解码器，签名同形，都返回 `BoxStream<'static, Result<String, LlmError>>`，泛型接受任意字节流：

```rust
pub fn parse_data_lines<S, B, E>(input: S) -> BoxStream<'static, Result<String, LlmError>>
where S: Stream<Item = Result<B, E>> + Send + Unpin + 'static, B: AsRef<[u8]>, E: Into<LlmError>
```

| 解码器 | 文件 | 用于 |
|--------|------|------|
| `parse_data_lines` | `sse.rs:19-24` | OpenAI（`openai.rs:138`）、Anthropic（`anthropic.rs:174`） |
| `parse_json_objects` | `json_array_stream.rs:73-78` | 仅 Gemini（`gemini.rs:201`） |

## SSE 解码

`sse.rs`：

- 跨 chunk 维护一个 `String` 缓冲（`:26`），因为一个 SSE 事件可能被 TCP 切在任意位置
- 字节块先经过共享 UTF-8 尾缓冲：合法多字节字符可在任意字节位置跨 chunk；只有真正非法字节立即失败，上游结束仍留半个字符才报 `Stream` 错误。
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
- 上游流报错 → 保留调用方已分类的 `LlmError` 并立即终止；provider 必须先把 `reqwest::Response::bytes_stream()` 的读取/解压失败映射为 `Network` 或 `Timeout`，不能降格为协议 `Stream`。

**首个错误即终止整个流**，不做部分恢复。

TCP 分片不是 Unicode 分片。任何按单个 `reqwest` 字节块直接 `from_utf8` 的实现都会在中文、日文等字符被拆开时误报协议错误；两个解码器都必须先保留不完整尾序列，并在流结束时检查该尾序列。

## payload 反序列化失败在上一层

解码器只管分帧，**不管 payload 是否匹配预期结构**。JSON 结构不符在各 provider 的 `chat_stream` 里报出：

```rust
serde_json::from_str(&payload)
    .map_err(|e| LlmError::Stream(format!("JSON 解析失败: {e}")))?
```

（`openai.rs:141-142`、`anthropic.rs:177-178`、`gemini.rs:204-205`）

因为在 `try_stream!` 里用 `?`，这个错误成为流的最后一项，流随即结束——**一个坏块杀死整条流**。三个 provider 各有 `surfaces_stream_json_error` 测试断言这个行为（结果向量只有一项且是错误）。

## `LlmError::Stream` 与响应体传输错误必须分离

`Stream` 只表示收到的协议内容无法解析：坏 UTF-8、SSE/JSON 分帧损坏或 payload 结构不符。`reqwest` 在读取、解压一个已成功 HTTP 响应体时产生的错误（典型文本为 `error decoding response body`）属于传输失败，provider 必须先经 `response_body_error` 映射为可重试 `Network` / `Timeout`，再交给解码器原样传播。禁止在解码器里统一 `to_string()` 包成 `Stream`，否则应用层的零输出重试永远无法触发。

## Scenario: 长响应流的超时边界

### 1. Scope / Trigger

- 适用于 OpenAI 兼容、Anthropic 和 Gemini 的所有流式 HTTP 请求，尤其是一次返回整篇 Markdown 的文档翻译。
- `reqwest::ClientBuilder::timeout` 是从连接开始直到响应体结束的总 deadline；把它用于流式生成会误杀持续返回增量但总耗时较长的健康请求。

### 2. Signatures

```rust
fn streaming_http_client_with_timeouts(
    inactivity_timeout: Duration,
    connect_timeout: Duration,
) -> Result<reqwest::Client, LlmError>;
```

生产入口 `streaming_http_client()` 固定使用 60 秒读取空闲超时和 15 秒连接超时；三个 provider 构造函数必须复用该入口。

### 3. Contracts

- 不设置 total request timeout。
- `read_timeout` 约束单次读取空闲时间，并在每次成功读取后重新计时。
- `connect_timeout` 单独约束连接阶段。
- 超时继续映射为 `LlmError::Timeout`；其他响应体读取错误继续经 `response_body_error` 脱敏并映射为 `Network`。
- 应用层“仅零输出、最多自动重试一次”的契约不变。

### 4. Validation & Error Matrix

| 条件 | 结果 |
|------|------|
| 总生成时长超过 60 秒，但每次读取间隔小于 60 秒 | 保持流存活并继续解析 |
| 连接阶段超过 15 秒 | `LlmError::Timeout` |
| 已收到响应头，但连续 60 秒没有响应体字节 | `LlmError::Timeout` |
| 响应体读取/解压失败且不是超时 | 脱敏后的 `LlmError::Network` |
| SSE/JSON/UTF-8 内容损坏 | `LlmError::Stream` |

### 5. Good / Base / Bad Cases

- Good：长文档持续输出增量，即使总耗时较长也完整返回。
- Base：短请求在默认阈值内正常完成。
- Bad：响应体真正停滞超过读取阈值时失败，不能无限等待。

### 6. Tests Required

- 用本地 TCP 流发送有效协议增量：每次间隔小于测试读取阈值，总时长大于该阈值；断言完整输出且没有 `Timeout`。
- 返回成功响应头后停止发送 body；外层必须有防挂死 guard，断言真实 `bytes_stream()` 路径产生 `LlmError::Timeout`。
- 三个 provider 的既有状态码、协议解析、密钥脱敏测试必须继续通过。

### 7. Wrong vs Correct

```rust
// Wrong: 总 deadline 会中断仍在持续输出的长流。
reqwest::Client::builder().timeout(Duration::from_secs(60))

// Correct: 只把持续无数据视为超时，并单独限制连接阶段。
reqwest::Client::builder()
    .read_timeout(Duration::from_secs(60))
    .connect_timeout(Duration::from_secs(15))
```

## 改动解码器必须加分片测试

解码器的核心价值就是正确处理任意切分。既有测试用 `futures::stream::iter(vec![chunk("..."), ...])` 手工构造分片（helper `fn chunk()` 在 `sse.rs:69-71`、`json_array_stream.rs:111-113`），**不用 wiremock**：

- `handles_events_split_across_chunks`（`sse.rs:87-97`）
- `handles_objects_split_across_chunks`（`json_array_stream.rs:139-145`）
- `yields_utf8_error_on_invalid_bytes`、`propagates_upstream_error`
- 多字节字符在每一个内部字节边界切分，以及流在该字符中途结束

改缓冲逻辑时，必须补一个「在最坏位置切开」的用例。provider 层的 wiremock 测试是一次性投递整个字符串的，**抓不到分片 bug**。

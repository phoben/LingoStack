# 错误与密钥

## `LlmError`

`src/lib.rs:100-114`：

```rust
#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("网络或连接错误: {0}")]
    Network(String),
    #[error("提供商返回 {status}: {body}")]
    Status { status: u16, body: String },
    #[error("响应流解析错误: {0}")]
    Stream(String),
    #[error("请求超时")]
    Timeout,
}
```

变体来源：

| 变体 | 何时产生 |
|------|----------|
| `Timeout` | `.send()` 失败且 `e.is_timeout()` 为真 |
| `Network` | 其他 `reqwest` 发送错误、客户端构造失败 |
| `Status` | `ensure_success()` 中非 2xx |
| `Stream` | 解码器分帧/UTF-8 错误 **或** payload JSON 结构不符（语义被复用，见 [流式解析](./streaming.md)） |

超时与网络的区分在调用点做，不在解析层——三个 provider 各有一份相同闭包（`openai.rs:130-136`、`anthropic.rs:166-172`、`gemini.rs:190-198`）。

## 重试：当前不存在

`lib.rs:118-131` 有两个分类谓词：

- `is_rate_limited()` → 仅 `Status { status: 429 }`
- `is_retryable()` → `Network`、`Timeout`、`Status` 中 429 或 ≥500

**这两个方法在生产代码里零调用**，只有自己的单元测试引用（`lib.rs:151-171`）。

实际行为：`src-tauri/src/commands.rs:76-104` 的 `chat_stream` 用朴素 `while let Some(result) = stream.next().await` 驱动，遇 `Err` 立即转发给前端并返回。**没有重试循环、没有指数退避、没有 429 降并发**。workspace 的 `tokio` 只启用了 `["macros", "rt-multi-thread"]`，连 `tokio::time::sleep` 都不可用。

前端的「重试」是**用户手点按钮**（`src/lib/ipc.ts:53`、`translate-view.tsx:67,214`、`naming-view.tsx:183`），不是自动重试。

**结论**：本 crate 只提供可重试性的**判定原语**，调用层预期要消费它但目前没有。要实装自动重试，需要（1）给 `tokio` 加 `time` feature，（2）在 `src-tauri` 的驱动循环里做，（3）补测试。别在写别的需求时假设它已经在了。

## 密钥防泄漏

三层措施，都是既有约定：

**1. provider 结构体不 derive `Debug`**

`OpenAiProvider` / `AnthropicProvider` / `GeminiProvider` 完全没有 derive（`openai.rs:52`、`anthropic.rs:73`、`gemini.rs:84`）。没有 `Debug` 实现 → `{:?}` 泄漏在结构上不可能发生。

**加 derive 前先想清楚**：给这些结构体加 `#[derive(Debug)]` 会直接把明文 key 暴露给任何 `{:?}`。真需要 `Debug`，照 `core` 里 `ProviderConfig` 的做法手写脱敏 impl。

**2. 错误信息与响应体擦除**

`lib.rs:96-99` 写明不变量：`LlmError` 永不含 API Key。

Gemini 的 key 在 URL 里，所以两条错误路径都必须主动擦除：

- 网络错误：`.replace(self.api_key.as_str(), "<redacted>")`（`gemini.rs:194-198`）
- HTTP 状态错误的响应体：`.replace(api_key, "<redacted>")`（`gemini.rs:157-174`，这也是它的 `ensure_success` 需要额外 `api_key` 参数的原因）

有测试守护：`surfaces_non_ok_status_with_key_redacted`（`gemini.rs:340-364`）用故意回显 key 的 mock 响应，断言 `!body.contains("gk-test")` 且 `body.contains("<redacted>")`。

OpenAI / Anthropic 不需要擦除，因为 key 只在头部，主流提供商不回显（依据见 `openai.rs:109` 注释）。

**3. 本 crate 无日志调用**

没有 `tracing` / `log`，所以 crate 内部没有泄漏面。唯一出口是调用方对 `LlmError` 的 `Display`——`src-tauri/src/commands.rs:95,98` 把它转成 `String` 给前端，而按上述措施该文本已是干净的。

## 新增提供商时的密钥自检

- [ ] key 是否出现在 URL / query 里？→ 必须在**所有**错误路径擦除，并加一个「mock 回显 key」的测试
- [ ] 新结构体没有 `#[derive(Debug)]`？
- [ ] 新错误信息里没有拼进 key、也没有整体拼进请求头？

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

## 重试：应用层负责

`lib.rs:118-131` 有两个分类谓词：

- `is_rate_limited()` → 仅 `Status { status: 429 }`
- `is_retryable()` → `Network`、`Timeout`、`Status` 中 429 或 ≥500

这两个方法由 `src-tauri/src/commands.rs` 的 `chat_stream` 消费；provider 保持一次请求对应一次普通文本流。

实际行为：`src-tauri/src/commands.rs` 只在零输出且 `is_retryable()` 时重建一次 provider stream；网络/超时/5xx 等待短退避，429 延长进程共享冷却并通知进入冷却的请求。已有部分输出、401/403 与协议解析错误立即转发，避免重复内容和重复计费。workspace 的 `tokio` 已启用 `time`。

前端的「重试」仍可由用户手点触发，用于自动重试结束后的失败（`src/lib/ipc.ts`、翻译/命名视图）。

**结论**：本 crate 只提供可重试性的**判定原语**；自动重试和共享冷却只能在 `src-tauri` 驱动层实现并测试，不能复制进三个 provider。

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

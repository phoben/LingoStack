# 提供商实现模式

## 核心 trait

`src/lib.rs:88-94`：

```rust
pub trait LlmProvider: Send + Sync {
    /// 以流式方式发起聊天，逐块返回增量文本。
    fn chat_stream<'a>(
        &'a self,
        request: &'a ChatRequest,
    ) -> BoxStream<'a, Result<ChatChunk, LlmError>>;
}
```

关键点：

- **不用 `async_trait`**（workspace 无此依赖）。同步方法返回 `futures::stream::BoxStream`
- `Send + Sync` 约束是为了对象安全，能 `Box<dyn LlmProvider>`（理由见 `:86-87`；实际用法见 `src-tauri/src/commands.rs:109-131`）
- 流的 item 是 `Result<ChatChunk, LlmError>`——**每块一个 Result**，不是整个流一个
- `'a` 同时绑 `&self` 和 `&request`，实现里直接借用，不必克隆请求

## 公共骨架

三个实现文件走同一套顺序，照抄即可：

**结构体**：`base_url: String`、`api_key: String`、`http: reqwest::Client`，加提供商特有字段。**均不 derive 任何 trait**（含 `Debug`，这是密钥防泄漏的一部分，见 [错误与密钥](./errors-and-secrets.md)）。

**构造函数**签名统一：

```rust
pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Result<Self, LlmError>
```

内部三步：建带 60 秒超时的 `reqwest::Client` → 失败映射为 `LlmError::Network(format!("HTTP 客户端构造失败: {e}"))` → `base_url.trim_end_matches('/')` 归一化（用户配置里多写斜杠不会导致双斜杠）。

Anthropic 额外有 builder 风格的 `with_max_tokens()`（`anthropic.rs:96-100`，`#[must_use]`，默认 4096）。

**私有辅助函数**按固定分工：`endpoint()` 拼 URL、`build_body()` 把共享 `ChatRequest` 映射成本协议的 `#[derive(Serialize)]` 结构、`ensure_success()` 校验状态码。

**`chat_stream` 实现**：构造 body → 建请求（头部各异）→ `.send().await` 并区分超时/网络错误 → `ensure_success()` → `resp.bytes_stream()` → 送进解码器 → `while let Some(payload) = stream.next().await` 循环，`serde_json::from_str` 每个 payload，取出增量文本，非空则 `yield ChatChunk { delta }`。整体包在 `async_stream::try_stream! { ... }.boxed()` 里。

## 三处分歧点

新增提供商时，差异只应出现在这三处：

**1. 鉴权方式**

| 提供商 | 方式 |
|--------|------|
| OpenAI 兼容 | `Authorization: Bearer {key}` 头（`openai.rs:121,126`） |
| Anthropic | `x-api-key` 头（无 Bearer 前缀）+ 必需的 `anthropic-version: 2023-06-01`（`anthropic.rs:161-162`） |
| Gemini | **无头部，key 进 URL query**：`?key={key}`（`gemini.rs:106-110`）——正因如此它需要额外的擦除逻辑 |

**2. system 角色处理**

- OpenAI：system 就是普通消息，`role: "system"`，无特殊处理（`openai.rs:80-99`）
- Anthropic：协议无 system 角色 → 从 messages 里提出来放顶层 `system` 字段，多条用 `\n` 拼（`anthropic.rs:129-133`）
- Gemini：同样提出到 `systemInstruction`，**且把 `Assistant` 角色重映射成字符串 `"model"`**（`gemini.rs:127-133`）

**3. 流式格式**：OpenAI / Anthropic 走 SSE；Gemini 走 JSON 数组。见 [流式解析](./streaming.md)。

## 刻意的重复，不要「优化」

以下代码在三个文件里近乎逐字重复，这是**为了让每个协议文件自洽可独读**的取舍，不是漏抽象：

- `ensure_success()`（`openai.rs:103-113`、`anthropic.rs:140-149`，Gemini 版本因需擦除 key 而有分歧：`gemini.rs:157-174`）
- 超时/网络错误映射闭包 `if e.is_timeout() { Timeout } else { Network(...) }`
- 客户端构造与 `base_url` 归一化
- 各文件私有的 `DEFAULT_TIMEOUT_SECS: u64 = 60` 常量

**改超时策略要改三处**（`openai.rs:16`、`anthropic.rs:26`、`gemini.rs:24`）。这是已知代价。

若要真正合并，那是一次独立的技术决策，需同时评估「协议文件可独读性」这个既有目标——不要在做别的需求时顺手抽象掉。

## 新增提供商前先问

多数情况**不需要新文件**：

- 服务兼容 OpenAI 协议（DeepSeek / 通义千问 / 智谱 / Ollama 等）→ 复用 `OpenAiProvider`，只在 `ProviderKind` 加变体（如需 UI 单列）并在 `src-tauri/src/commands.rs` 的 match 里挂到 OpenAI 分支
- 协议真不同 → 新建 `<name>.rs`，照上面骨架写，并在 `build_provider`（`commands.rs:109-132`）加分支

`build_provider` 的 match **无通配分支**，所以新增 `ProviderKind` 变体会直接编译失败——这才是真正的完备性保障。`commands.rs:171-183` 那个测试的注释声称是它在保障，实际不准确；测试只是冗余断言。

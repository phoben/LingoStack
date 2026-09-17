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

四个协议实现文件走同一套顺序：`openai.rs`、`responses.rs`、`anthropic.rs`、`gemini.rs`。Ollama 继续复用 OpenAI Chat 兼容面，不新增 native `/api/chat` adapter。

**结构体**：`base_url: String`、`api_key: String`、`http: reqwest::Client`，加提供商特有字段。**均不 derive 任何 trait**（含 `Debug`，这是密钥防泄漏的一部分，见 [错误与密钥](./errors-and-secrets.md)）。

OpenAI Chat、Responses、Anthropic、Gemini 构造函数都接受 base URL 与 key；无认证的 OpenAI 兼容实例允许空 key，并且不得发送空 Bearer 头。

```rust
pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Result<Self, LlmError>
```

内部三步：建带 60 秒超时的 `reqwest::Client` → 失败映射为 `LlmError::Network(format!("HTTP 客户端构造失败: {e}"))` → `base_url.trim_end_matches('/')` 归一化（用户配置里多写斜杠不会导致双斜杠）。

Anthropic 额外有 builder 风格的 `with_max_tokens()`（`anthropic.rs:96-100`，`#[must_use]`，默认 4096）。

**私有辅助函数**按固定分工：`endpoint()` 拼 URL、`build_body()` 把共享 `ChatRequest` 映射成本协议的 `#[derive(Serialize)]` 结构、`ensure_success()` 校验状态码。

**`chat_stream` 实现**：构造 body → 建请求（头部各异）→ `.send().await` 并区分超时/网络错误 → `ensure_success()` → `resp.bytes_stream()` → 送进解码器 → `while let Some(payload) = stream.next().await` 循环，`serde_json::from_str` 每个 payload，取出增量文本，非空则 `yield ChatChunk { delta }`。整体包在 `async_stream::try_stream! { ... }.boxed()` 里。

## 协议分歧点

新增提供商时，差异只应出现在这三处：

**1. 鉴权方式**

| 提供商 | 方式 |
|--------|------|
| OpenAI 兼容 | `Authorization: Bearer {key}` 头（`openai.rs:121,126`） |
| OpenAI Responses | `Authorization: Bearer {key}`，只允许官方 OpenAI preset/endpoint |
| Anthropic | `x-api-key` 头（无 Bearer 前缀）+ 必需的 `anthropic-version: 2023-06-01`（`anthropic.rs:161-162`） |
| Gemini | chat 请求的 key 在 URL query；模型发现使用 `x-goog-api-key` header。两条路径都必须脱敏 |

**2. system 角色处理**

- OpenAI：system 就是普通消息，`role: "system"`，无特殊处理（`openai.rs:80-99`）
- Anthropic：协议无 system 角色 → 从 messages 里提出来放顶层 `system` 字段，多条用 `\n` 拼（`anthropic.rs:129-133`）
- Gemini：同样提出到 `systemInstruction`，**且把 `Assistant` 角色重映射成字符串 `"model"`**（`gemini.rs:127-133`）

**3. 流式格式**：OpenAI Chat / Responses / Anthropic 走 SSE；Gemini 走 JSON 数组。Responses 使用 `/v1/responses`、独立请求体和具名 `response.output_text.delta` 事件，禁止复用 Chat Completions delta 结构。见 [流式解析](./streaming.md)。

**4. generation 字段**：`ChatRequest` 只携带 core 已校验的 temperature、max output field/value 与 reasoning effort。adapter 仅做协议字段映射，不自行猜测模型能力；字段枚举不匹配当前协议时必须省略。

## 刻意的重复，不要「优化」

以下代码在协议文件里近乎逐字重复，这是**为了让每个协议文件自洽可独读**的取舍，不是漏抽象：

- `ensure_success()`（`openai.rs:103-113`、`anthropic.rs:140-149`，Gemini 版本因需擦除 key 而有分歧：`gemini.rs:157-174`）
- 超时/网络错误映射闭包 `if e.is_timeout() { Timeout } else { Network(...) }`
- 客户端构造与 `base_url` 归一化
- 各文件私有的 `DEFAULT_TIMEOUT_SECS: u64 = 60` 常量

**改超时策略要改三处**（`openai.rs:16`、`anthropic.rs:26`、`gemini.rs:24`）。这是已知代价。

若要真正合并，那是一次独立的技术决策，需同时评估「协议文件可独读性」这个既有目标——不要在做别的需求时顺手抽象掉。

## 新增提供商前先问

多数情况**不需要新文件**：

- 服务兼容 OpenAI Chat 协议（DeepSeek / 通义千问 / 智谱 / Ollama 等）→ 预设选择 `Protocol::OpenAiChatCompletions`，复用 `OpenAiProvider`；品牌不再扩展协议枚举
- 协议真不同 → 新建 `<name>.rs`，照上面骨架写，并在 `build_provider`（`commands.rs:109-132`）加分支

`build_provider` 的 match **无通配分支**，所以新增 `Protocol` 变体会直接编译失败。品牌预设不应改变 factory；只有真正新增 wire protocol 才扩展此 match。

## 模型发现不是 `LlmProvider`

`discovery.rs` 提供一次性 `discover_models(DiscoveryRequest)`。它由设置页显式触发，不进入聊天 trait，也不在启动时运行。支持 OpenAI style、Anthropic 游标分页、Gemini 与 Ollama `/api/tags`；错误正文统一经过 secret 擦除和 2048 字符上限。

端点规则必须兼容用户已经填写版本前缀：OpenAI style base 以 `/v1` 或 `/v4` 结尾时直接追加 `/models`，否则追加 `/v1/models`；聊天端点采用相同规则追加 `/chat/completions`，避免形成 `/v1/v1/...`。

## Scenario: 新协议或发现适配

### 1. Scope / Trigger

- 新增协议、变更请求体/流式事件、generation 映射或模型发现时适用。

### 2. Signatures

```rust
pub trait LlmProvider: Send + Sync {
    fn chat_stream<'a>(&'a self, request: &'a ChatRequest)
        -> BoxStream<'a, Result<ChatChunk, LlmError>>;
}

pub async fn discover_models(request: DiscoveryRequest)
    -> Result<Vec<DiscoveredModel>, LlmError>;
```

### 3. Contracts

- 功能层只认 `LlmProvider`；品牌/预设不能进入业务调用分支。
- Responses 与 Chat Completions 请求体、端点、事件解析完全分离。
- adapter 只发送 `ChatRequest` 中与当前协议字段枚举匹配的 optional generation。
- discovery 只返回候选，core/UI 负责来源标记与非破坏性 merge。
- 所有外部错误正文先脱敏再截断；provider struct 不 derive `Debug`。

### 4. Validation & Error Matrix

| 条件 | 结果 |
|---|---|
| HTTP 非 2xx | `Status`，正文脱敏且最多 2048 字符 |
| 请求/正文读取超时 | `Timeout` |
| 其他网络/正文传输失败 | `Network`，可在零输出时重试 |
| SSE/JSON/UTF-8 不合法 | `Stream`，不自动重试 |
| Anthropic 重复分页 cursor | 停止并报协议错误，禁止无限循环 |
| 发现返回重复模型 ID | 去重且保留首个规范化结果 |

### 5. Good / Base / Bad Cases

- Good：OpenAI 官方 Responses 用独立 adapter；DeepSeek/Ollama 继续走 Chat adapter。
- Base：无 optional generation 时沿用提供商默认。
- Bad：看到“OpenAI compatible”就自动开放 Responses，或把 Ollama `/api/chat` 的 NDJSON 交给 SSE parser。

### 6. Tests Required

- 每个协议的请求形状、鉴权、状态错误、坏 payload、secret 回显。
- Responses 具名事件、CRLF、多行 data、delta 与 failure event。
- OpenAI versioned base、Anthropic 多页、Gemini capability filtering/limits、Ollama tags。
- discovery 空结果、分页/状态/JSON 错误和 ID 去重。

### 7. Wrong vs Correct

```rust
// Wrong：所有兼容服务都复用 Responses body。
OpenAiProvider::new(base, key).chat_stream(responses_request)

// Correct：协议枚举选择独立 adapter；品牌只影响预设默认值。
Protocol::OpenAiResponses => Box::new(OpenAiResponsesProvider::new(base, key)?),
```

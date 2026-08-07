# lingostack-llm 开发规范

> LLM 适配层。对外只暴露 `LlmProvider` trait + `chat_stream()`；功能层只认 trait，禁止直连具体提供商。

路径：`crates/lingostack-llm`

## 开发前检查清单

- [ ] 读了 [Rust 通用约定](../../guides/rust-conventions.md)
- [ ] 新增提供商？→ 读 [提供商实现模式](./provider-pattern.md)，先判断是否真需要新文件（多数 OpenAI 兼容服务不需要）
- [ ] 动流式解析？→ 读 [流式解析](./streaming.md)，注意跨 chunk 缓冲与分片测试
- [ ] 错误相关改动？→ 读 [错误与密钥](./errors-and-secrets.md)。**注意重试逻辑当前并不存在**
- [ ] 新增 / 改动请求响应处理？必须补 wiremock 测试，CI 不用真实密钥

## 具体规范

| 文档 | 内容 |
|------|------|
| [提供商实现模式](./provider-pattern.md) | trait 定义、三个实现的公共骨架与分歧点、刻意重复的边界 |
| [流式解析](./streaming.md) | SSE 与 JSON 数组两套解码器、缓冲、终止、错误传播 |
| [错误与密钥](./errors-and-secrets.md) | `LlmError` 变体语义、密钥防泄漏、**重试现状** |
| [测试规范](./testing.md) | wiremock 用法、分片测试、canonical 测试形状 |

## 实际有几个提供商

**三个**实现文件：`openai.rs`、`anthropic.rs`、`gemini.rs`。

**没有 `ollama.rs`**。Ollama 走 OpenAI 兼容协议，直接复用 `OpenAiProvider`（`openai.rs:1-4` 写明）。`ProviderKind::Ollama` 只是配置层的 UI 区分项，用于预填 `http://localhost:11434`（`core/src/config.rs:29`），在 `src-tauri/src/commands.rs:111-116` 与 `OpenAiCompatible` 共用一个 match 分支。

别去找或新建「第四个协议实现」。

## 质量检查

```bash
cargo clippy --all-targets -- -D warnings
cargo test -p lingostack-llm       # 现有 37 个测试
```

集成测试只用 `wiremock`（dev-dependency），**CI 中不使用真实密钥**。

## 已知的文档与代码不一致

CLAUDE.md 与设计文档称「超时 / 5xx 自动重试 1 次（指数退避）；429 显示等待并降并发」。**这套逻辑在代码里不存在**。详见 [错误与密钥](./errors-and-secrets.md)——写新代码时不要假设它在。

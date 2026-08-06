//! # lingostack-llm
//!
//! LLM 适配层：统一抽象 OpenAI 兼容 / Anthropic / Gemini / Ollama 等提供商。
//!
//! 功能层（翻译 / 命名 / 解释 / 文档翻译）只依赖 [`LlmProvider`] trait，
//! 禁止直连具体提供商。V0 仅声明 trait 与 `chat_stream` 签名空壳；
//! V1 实现各提供商适配与 SSE 流解析（集成测试用 wiremock）。

use serde::{Deserialize, Serialize};

// === V1 待实现子模块 ===
// mod openai;       // OpenAI 兼容协议（覆盖 DeepSeek / 通义 / 智谱 / Ollama）
// mod anthropic;    // Anthropic 原生协议
// mod gemini;       // Gemini 原生协议
// mod stream;       // SSE 流解析

/// 一次聊天请求（V0 占位结构，V1 细化 system / messages / temperature 等）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    /// 模型标识，如 `"gpt-4o"` / `"deepseek-chat"`。
    pub model: String,
    /// 用户输入文本。
    pub prompt: String,
}

/// 流式返回的单个文本片段。
#[derive(Debug, Clone)]
pub struct ChatChunk {
    /// 本次增量文本。
    pub delta: String,
}

/// LLM 提供商统一抽象。
///
/// 所有功能层只依赖此 trait；具体提供商实现见各子模块（V1）。
pub trait LlmProvider: Send + Sync {
    /// 以流式方式发起聊天，逐块返回增量文本。
    ///
    /// V0 仅声明签名；V1 返回真实的 SSE 流。
    fn chat_stream(
        &self,
        request: &ChatRequest,
    ) -> impl std::future::Future<Output = Result<Vec<ChatChunk>, LlmError>> + Send;
}

/// LLM 调用错误（V0 占位，V1 细化重试 / 限流分支，见设计文档 §9）。
#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("网络或连接错误: {0}")]
    Network(String),
    #[error("提供商返回错误状态: {0}")]
    Status(String),
    #[error("响应流解析错误: {0}")]
    Stream(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 证明 trait 可被实现并构造 future（编译期验证类型系统空壳完整）。
    struct DummyProvider;
    impl LlmProvider for DummyProvider {
        async fn chat_stream(&self, _req: &ChatRequest) -> Result<Vec<ChatChunk>, LlmError> {
            Ok(vec![ChatChunk { delta: "ok".into() }])
        }
    }

    #[test]
    fn smoke() {
        let provider = DummyProvider;
        let req = ChatRequest {
            model: "dummy".into(),
            prompt: "hi".into(),
        };
        // 仅构造 future，不 await（避免引入运行时）。
        let _fut = provider.chat_stream(&req);
    }

    #[test]
    fn request_serializes() {
        let req = ChatRequest {
            model: "gpt-4o".into(),
            prompt: "hello".into(),
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("gpt-4o"));
    }
}

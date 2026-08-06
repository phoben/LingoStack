//! # lingostack-llm
//!
//! LLM 适配层：统一抽象 OpenAI 兼容 / Anthropic / Gemini / Ollama 等提供商。
//!
//! 功能层（翻译 / 命名 / 解释 / 文档翻译）只依赖 [`LlmProvider`] trait，
//! 禁止直连具体提供商。具体协议实现见各子模块（如 [`openai`])。

use futures::stream::BoxStream;
use serde::{Deserialize, Serialize};

pub mod openai;
mod sse;

/// 一条消息（system / user / assistant）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

impl ChatMessage {
    /// 构造 user 消息。
    #[must_use]
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: ChatRole::User,
            content: content.into(),
        }
    }

    /// 构造 system 消息。
    #[must_use]
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: ChatRole::System,
            content: content.into(),
        }
    }
}

/// 消息角色。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    System,
    User,
    Assistant,
}

/// 一次聊天请求。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    /// 模型标识，如 `"gpt-4o"` / `"deepseek-chat"`。
    pub model: String,
    /// 消息列表（通常 system 在前、user 在后）。
    pub messages: Vec<ChatMessage>,
    /// 采样温度；`None` 表示用提供商默认。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
}

impl ChatRequest {
    #[must_use]
    pub fn new(model: impl Into<String>, messages: Vec<ChatMessage>) -> Self {
        Self {
            model: model.into(),
            messages,
            temperature: None,
        }
    }
}

/// 流式返回的单个增量文本片段。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatChunk {
    /// 本次增量文本。
    pub delta: String,
}

/// LLM 提供商统一抽象。
///
/// 所有功能层只依赖此 trait；具体实现见 [`openai::OpenAiProvider`] 等。
/// 返回 [`BoxStream`] 以保证 trait 对象安全（可 `dyn LlmProvider`），便于
/// 运行时按配置挑选提供商。
pub trait LlmProvider: Send + Sync {
    /// 以流式方式发起聊天，逐块返回增量文本。
    fn chat_stream<'a>(
        &'a self,
        request: &'a ChatRequest,
    ) -> BoxStream<'a, Result<ChatChunk, LlmError>>;
}

/// LLM 调用错误（见设计文档 §9）。
///
/// **永不包含 API Key** —— Key 经由 HTTP header 传递，错误信息只记录状态码与
/// 响应体片段（响应体不应回显 Key；若提供商回显，应由协议层截断）。
#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    /// 网络或连接错误（DNS / 连接拒绝 / TLS 等）。
    #[error("网络或连接错误: {0}")]
    Network(String),
    /// 提供商返回非 2xx。`status` 含具体码（如 401 / 429 / 500）。
    #[error("提供商返回 {status}: {body}")]
    Status { status: u16, body: String },
    /// 响应流解析错误（SSE 损坏 / JSON 不合法 / UTF-8 错误）。
    #[error("响应流解析错误: {0}")]
    Stream(String),
    /// 请求超时（达到客户端配置的超时阈值）。
    #[error("请求超时")]
    Timeout,
}

impl LlmError {
    /// 是否为速率限制（429），用于触发降并发（§9）。
    #[must_use]
    pub fn is_rate_limited(&self) -> bool {
        matches!(self, Self::Status { status: 429, .. })
    }

    /// 是否为可重试的临时错误（网络 / 超时 / 429 / 5xx）。
    #[must_use]
    pub fn is_retryable(&self) -> bool {
        match self {
            Self::Network(_) | Self::Timeout => true,
            Self::Status { status, .. } => *status == 429 || *status >= 500,
            Self::Stream(_) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_message_constructors_set_role() {
        assert_eq!(ChatMessage::user("hi").role, ChatRole::User);
        assert_eq!(ChatMessage::system("rule").role, ChatRole::System);
    }

    #[test]
    fn chat_role_serializes_lowercase() {
        let json = serde_json::to_string(&ChatRole::Assistant).unwrap();
        assert_eq!(json, "\"assistant\"");
    }

    #[test]
    fn error_retryable_and_rate_limited_classification() {
        assert!(LlmError::Timeout.is_retryable());
        assert!(LlmError::Network("x".into()).is_retryable());
        assert!(LlmError::Status {
            status: 429,
            body: String::new()
        }
        .is_rate_limited());
        assert!(LlmError::Status {
            status: 503,
            body: String::new()
        }
        .is_retryable());
        // 4xx（非 429）不可重试。
        assert!(!LlmError::Status {
            status: 401,
            body: String::new()
        }
        .is_retryable());
        assert!(!LlmError::Stream("bad json".into()).is_retryable());
    }
}

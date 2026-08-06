//! Anthropic 原生协议适配器（Claude）。
//!
//! 端点：`POST {base_url}/v1/messages`，SSE 流式响应。
//!
//! 与 OpenAI 兼容协议的关键差异（均据官方 SDK/适配器实现核对）：
//! - 鉴权用 `x-api-key` header，而非 `Authorization: Bearer`；
//! - 必须带 `anthropic-version` header；
//! - `max_tokens` 为**必填**字段；
//! - 无 `role: "system"`，system prompt 是顶层 `system` 字符串字段；
//! - 流式事件分多种类型（`message_start` / `content_block_delta` / …），
//!   增量文本在 `content_block_delta` 事件的 `delta.text`。
//!
//! 事件类型判别走 data 负载内的 `type` 字段（而非 SSE 的 `event:` 行），
//! 因为非 delta 事件的负载不含 `delta.text`，按 type 分派即可复用通用 SSE 层。

use std::time::Duration;

use async_stream::try_stream;
use futures::stream::BoxStream;
use futures::StreamExt;
use serde::{Deserialize, Serialize};

use crate::sse::parse_data_lines;
use crate::{ChatChunk, ChatRequest, ChatRole, LlmError, LlmProvider};

const DEFAULT_TIMEOUT_SECS: u64 = 60;
/// Anthropic 要求的 API 版本 header 值。
const ANTHROPIC_VERSION: &str = "2023-06-01";
/// `max_tokens` 必填，未指定时的默认上限。
const DEFAULT_MAX_TOKENS: u32 = 4096;

/// Anthropic `/v1/messages` 请求体。
#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    messages: Vec<AnthropicMessage>,
    /// 必填字段（协议要求）。
    max_tokens: u32,
    stream: bool,
    /// system prompt 为顶层字段；无则省略。
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

/// Anthropic 只接受 user / assistant 两种角色。
#[derive(Serialize)]
struct AnthropicMessage {
    role: &'static str,
    content: String,
}

/// 流式事件（按 `type` 判别）。仅关心携带增量文本的变体。
#[derive(Deserialize)]
#[serde(tag = "type")]
enum StreamEvent {
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta { delta: TextDelta },
    /// 其余事件（message_start / content_block_start / message_delta /
    /// message_stop / ping 等）无增量文本，统一忽略。
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
struct TextDelta {
    #[serde(default)]
    text: Option<String>,
}

/// Anthropic 提供商。
pub struct AnthropicProvider {
    base_url: String,
    api_key: String,
    max_tokens: u32,
    http: reqwest::Client,
}

impl AnthropicProvider {
    /// 构造提供商。`base_url` 形如 `https://api.anthropic.com`（不含 `/v1/...`）。
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Result<Self, LlmError> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .build()
            .map_err(|e| LlmError::Network(format!("HTTP 客户端构造失败: {e}")))?;
        Ok(Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
            max_tokens: DEFAULT_MAX_TOKENS,
            http,
        })
    }

    /// 覆盖 `max_tokens`（默认 4096）。
    #[must_use]
    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = max_tokens;
        self
    }

    fn endpoint(&self) -> String {
        format!("{}/v1/messages", self.base_url)
    }

    /// 拆分 system 与对话消息——Anthropic 的 system 不在 messages 里。
    /// 多条 system 消息按换行合并为单个字段。
    fn build_body(&self, request: &ChatRequest) -> AnthropicRequest {
        let mut systems: Vec<&str> = Vec::new();
        let mut messages: Vec<AnthropicMessage> = Vec::new();
        for m in &request.messages {
            match m.role {
                ChatRole::System => systems.push(m.content.as_str()),
                ChatRole::User => messages.push(AnthropicMessage {
                    role: "user",
                    content: m.content.clone(),
                }),
                ChatRole::Assistant => messages.push(AnthropicMessage {
                    role: "assistant",
                    content: m.content.clone(),
                }),
            }
        }
        AnthropicRequest {
            model: request.model.clone(),
            messages,
            max_tokens: self.max_tokens,
            stream: true,
            system: if systems.is_empty() {
                None
            } else {
                Some(systems.join("\n"))
            },
            temperature: request.temperature,
        }
    }
}

/// 校验响应状态：2xx 放行，否则读 body 包成 [`LlmError::Status`]。
async fn ensure_success(resp: reqwest::Response) -> Result<reqwest::Response, LlmError> {
    let status = resp.status();
    if status.is_success() {
        Ok(resp)
    } else {
        let code = status.as_u16();
        let body = resp.text().await.unwrap_or_default();
        Err(LlmError::Status { status: code, body })
    }
}

impl LlmProvider for AnthropicProvider {
    fn chat_stream<'a>(
        &'a self,
        request: &'a ChatRequest,
    ) -> BoxStream<'a, Result<ChatChunk, LlmError>> {
        let body = self.build_body(request);
        try_stream! {
            let resp = self
                .http
                .post(self.endpoint())
                .header("x-api-key", self.api_key.as_str())
                .header("anthropic-version", ANTHROPIC_VERSION)
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    if e.is_timeout() {
                        LlmError::Timeout
                    } else {
                        LlmError::Network(e.to_string())
                    }
                })?;
            let resp = ensure_success(resp).await?;
            let mut payloads = parse_data_lines(resp.bytes_stream());
            while let Some(payload) = payloads.next().await {
                let payload = payload?;
                let event: StreamEvent = serde_json::from_str(&payload)
                    .map_err(|e| LlmError::Stream(format!("JSON 解析失败: {e}")))?;
                if let StreamEvent::ContentBlockDelta { delta } = event {
                    if let Some(text) = delta.text {
                        if !text.is_empty() {
                            yield ChatChunk { delta: text };
                        }
                    }
                }
            }
        }
        .boxed()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ChatMessage, ChatRequest};
    use wiremock::matchers::{body_partial_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn request() -> ChatRequest {
        ChatRequest::new(
            "claude-sonnet-5",
            vec![ChatMessage::system("你是翻译"), ChatMessage::user("hello")],
        )
    }

    /// 真实 Anthropic 流的事件序列（含无增量的事件，须被跳过）。
    const SSE_STREAM: &str = concat!(
        "data: {\"type\":\"message_start\",\"message\":{\"id\":\"m1\"}}\n\n",
        "data: {\"type\":\"content_block_start\",\"index\":0}\n\n",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\" world\"}}\n\n",
        "data: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
        "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"}}\n\n",
        "data: {\"type\":\"message_stop\"}\n\n",
    );

    async fn deltas(server: &MockServer) -> Vec<String> {
        let provider = AnthropicProvider::new(server.uri(), "sk-ant-test").unwrap();
        provider
            .chat_stream(&request())
            .filter_map(|r| async move { r.ok() })
            .map(|c| c.delta)
            .collect()
            .await
    }

    #[tokio::test]
    async fn streams_deltas_with_api_key_and_version_headers() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .and(header("x-api-key", "sk-ant-test"))
            .and(header("anthropic-version", ANTHROPIC_VERSION))
            .respond_with(ResponseTemplate::new(200).set_body_raw(SSE_STREAM, "text/event-stream"))
            .mount(&server)
            .await;
        assert_eq!(deltas(&server).await.concat(), "Hello world");
    }

    #[tokio::test]
    async fn skips_non_delta_events() {
        // 只有两个 content_block_delta 产出 chunk，其余 5 个事件被忽略。
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(SSE_STREAM, "text/event-stream"))
            .mount(&server)
            .await;
        assert_eq!(deltas(&server).await.len(), 2);
    }

    #[tokio::test]
    async fn body_hoists_system_and_requires_max_tokens() {
        // system 提到顶层字段、messages 只留 user、max_tokens 必填、stream:true。
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .and(body_partial_json(serde_json::json!({
                "model": "claude-sonnet-5",
                "stream": true,
                "max_tokens": 4096,
                "system": "你是翻译",
                "messages": [{"role": "user", "content": "hello"}]
            })))
            .respond_with(ResponseTemplate::new(200).set_body_raw(SSE_STREAM, "text/event-stream"))
            .mount(&server)
            .await;
        assert_eq!(deltas(&server).await.concat(), "Hello world");
    }

    #[tokio::test]
    async fn with_max_tokens_overrides_default() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .and(body_partial_json(serde_json::json!({ "max_tokens": 1024 })))
            .respond_with(ResponseTemplate::new(200).set_body_raw(SSE_STREAM, "text/event-stream"))
            .mount(&server)
            .await;
        let provider = AnthropicProvider::new(server.uri(), "sk-ant-test")
            .unwrap()
            .with_max_tokens(1024);
        let out: Vec<String> = provider
            .chat_stream(&request())
            .filter_map(|r| async move { r.ok() })
            .map(|c| c.delta)
            .collect()
            .await;
        assert_eq!(out.concat(), "Hello world");
    }

    #[tokio::test]
    async fn merges_multiple_system_messages() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .and(body_partial_json(
                serde_json::json!({ "system": "规则一\n规则二" }),
            ))
            .respond_with(ResponseTemplate::new(200).set_body_raw(SSE_STREAM, "text/event-stream"))
            .mount(&server)
            .await;
        let provider = AnthropicProvider::new(server.uri(), "sk-ant-test").unwrap();
        let req = ChatRequest::new(
            "claude-sonnet-5",
            vec![
                ChatMessage::system("规则一"),
                ChatMessage::system("规则二"),
                ChatMessage::user("hi"),
            ],
        );
        let out: Vec<String> = provider
            .chat_stream(&req)
            .filter_map(|r| async move { r.ok() })
            .map(|c| c.delta)
            .collect()
            .await;
        assert_eq!(out.concat(), "Hello world");
    }

    #[tokio::test]
    async fn omits_system_when_absent() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(SSE_STREAM, "text/event-stream"))
            .mount(&server)
            .await;
        let provider = AnthropicProvider::new(server.uri(), "sk-ant-test").unwrap();
        let req = ChatRequest::new("claude-sonnet-5", vec![ChatMessage::user("hi")]);
        let body = provider.build_body(&req);
        assert!(body.system.is_none());
        let json = serde_json::to_string(&body).unwrap();
        assert!(!json.contains("system"));
    }

    #[tokio::test]
    async fn surfaces_non_ok_status() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .respond_with(ResponseTemplate::new(401).set_body_string("invalid x-api-key"))
            .mount(&server)
            .await;
        let provider = AnthropicProvider::new(server.uri(), "sk-ant-test").unwrap();
        let results: Vec<_> = provider.chat_stream(&request()).collect().await;
        match results[0].as_ref() {
            Err(LlmError::Status { status, body }) => {
                assert_eq!(*status, 401);
                assert!(body.contains("invalid x-api-key"));
            }
            other => panic!("期望 Status 错误，实际: {other:?}"),
        }
    }

    #[tokio::test]
    async fn surfaces_stream_json_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/messages"))
            .respond_with(
                ResponseTemplate::new(200).set_body_raw("data: not-json\n\n", "text/event-stream"),
            )
            .mount(&server)
            .await;
        let provider = AnthropicProvider::new(server.uri(), "sk-ant-test").unwrap();
        let results: Vec<_> = provider.chat_stream(&request()).collect().await;
        assert!(matches!(results[0].as_ref(), Err(LlmError::Stream(_))));
    }
}

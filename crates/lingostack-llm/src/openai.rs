//! OpenAI 兼容协议适配器（覆盖 OpenAI / DeepSeek / 通义千问 / 智谱 / Ollama）。
//!
//! 端点：`POST {base_url}/v1/chat/completions`，Bearer 鉴权，SSE 流式响应。
//! Ollama 同走该协议（默认 `http://localhost:11434`），故不另起实现。

use std::time::Duration;

use async_stream::try_stream;
use futures::stream::BoxStream;
use futures::StreamExt;
use serde::{Deserialize, Serialize};

use crate::sse::parse_data_lines;
use crate::{ChatChunk, ChatRequest, LlmError, LlmProvider};

const DEFAULT_TIMEOUT_SECS: u64 = 60;

/// OpenAI 兼容协议的请求体。
#[derive(Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize)]
struct OpenAiMessage {
    role: &'static str,
    content: String,
}

/// OpenAI 流式响应的单个 chunk（仅提取增量文本）。
#[derive(Deserialize)]
struct OpenAiStreamChunk {
    choices: Vec<OpenAiChoice>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    delta: OpenAiDelta,
}

#[derive(Deserialize, Default)]
struct OpenAiDelta {
    #[serde(default)]
    content: Option<String>,
}

/// OpenAI 兼容提供商。
pub struct OpenAiProvider {
    base_url: String,
    api_key: String,
    http: reqwest::Client,
}

impl OpenAiProvider {
    /// 构造提供商。`base_url` 形如 `https://api.deepseek.com`（不含 `/v1/...`）。
    ///
    /// 返回 `Result` 以承载 HTTP 客户端构造失败（极罕见，通常 TLS 后端初始化）。
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Result<Self, LlmError> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .build()
            .map_err(|e| LlmError::Network(format!("HTTP 客户端构造失败: {e}")))?;
        Ok(Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
            http,
        })
    }

    #[must_use]
    fn endpoint(&self) -> String {
        format!("{}/v1/chat/completions", self.base_url)
    }

    /// 把 [`ChatRequest`] 转为 OpenAI 协议的请求体。
    fn build_body(&self, request: &ChatRequest) -> OpenAiRequest {
        let messages = request
            .messages
            .iter()
            .map(|m| OpenAiMessage {
                role: match m.role {
                    crate::ChatRole::System => "system",
                    crate::ChatRole::User => "user",
                    crate::ChatRole::Assistant => "assistant",
                },
                content: m.content.clone(),
            })
            .collect();
        OpenAiRequest {
            model: request.model.clone(),
            messages,
            stream: true,
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
        // body 可能含提供商的错误说明；不应回显 API Key，各主流提供商均不回显。
        let body = resp.text().await.unwrap_or_default();
        Err(LlmError::Status { status: code, body })
    }
}

impl LlmProvider for OpenAiProvider {
    fn chat_stream<'a>(
        &'a self,
        request: &'a ChatRequest,
    ) -> BoxStream<'a, Result<ChatChunk, LlmError>> {
        let body = self.build_body(request);
        let auth_header = format!("Bearer {}", self.api_key);
        try_stream! {
            let resp = self
                .http
                .post(self.endpoint())
                .header(reqwest::header::AUTHORIZATION, auth_header)
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
                let parsed: OpenAiStreamChunk = serde_json::from_str(&payload)
                    .map_err(|e| LlmError::Stream(format!("JSON 解析失败: {e}")))?;
                if let Some(text) = parsed
                    .choices
                    .into_iter()
                    .next()
                    .and_then(|c| c.delta.content)
                {
                    if !text.is_empty() {
                        yield ChatChunk { delta: text };
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
            "deepseek-chat",
            vec![ChatMessage::system("你是翻译"), ChatMessage::user("hello")],
        )
    }

    #[tokio::test]
    async fn streams_deltas_and_sends_bearer_auth() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .and(header("authorization", "Bearer sk-test"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n\
                 data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n\
                 data: [DONE]\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;

        let provider = OpenAiProvider::new(server.uri(), "sk-test").unwrap();
        let deltas: Vec<String> = provider
            .chat_stream(&request())
            .filter_map(|r| async move { r.ok() })
            .map(|c| c.delta)
            .collect()
            .await;
        assert_eq!(deltas.concat(), "Hello world");
    }

    #[tokio::test]
    async fn surfaces_non_ok_status() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(401).set_body_string("invalid api key"))
            .mount(&server)
            .await;

        let provider = OpenAiProvider::new(server.uri(), "sk-test").unwrap();
        let results: Vec<_> = provider.chat_stream(&request()).collect().await;
        assert_eq!(results.len(), 1);
        match results[0].as_ref() {
            Err(LlmError::Status { status, body }) => {
                assert_eq!(*status, 401);
                assert!(body.contains("invalid api key"));
            }
            other => panic!("期望 Status 错误，实际: {other:?}"),
        }
    }

    #[tokio::test]
    async fn skips_chunks_without_content() {
        // role-only delta（无 content）应被跳过，不产出空 chunk。
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n\n\
                 data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n\
                 data: [DONE]\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;

        let provider = OpenAiProvider::new(server.uri(), "sk-test").unwrap();
        let deltas: Vec<String> = provider
            .chat_stream(&request())
            .filter_map(|r| async move { r.ok() })
            .map(|c| c.delta)
            .collect()
            .await;
        assert_eq!(deltas, vec!["hi".to_string()]);
    }

    #[tokio::test]
    async fn request_body_carries_model_messages_and_stream() {
        // body_partial_json 匹配器：请求体必须含 model/stream/messages 结构，
        // 否则 wiremock 不响应（返回默认 404），deltas 为空。
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .and(body_partial_json(serde_json::json!({
                "model": "deepseek-chat",
                "stream": true,
                "messages": [
                    {"role":"system","content":"你是翻译"},
                    {"role":"user","content":"hello"}
                ]
            })))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;

        let provider = OpenAiProvider::new(server.uri(), "sk-test").unwrap();
        let deltas: Vec<String> = provider
            .chat_stream(&request())
            .filter_map(|r| async move { r.ok() })
            .map(|c| c.delta)
            .collect()
            .await;
        assert_eq!(deltas, vec!["ok".to_string()]);
    }

    #[tokio::test]
    async fn surfaces_stream_json_error() {
        // 损坏的 data 行（非合法 JSON）→ Stream 错误
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_raw("data: not-json\n\ndata: [DONE]\n\n", "text/event-stream"),
            )
            .mount(&server)
            .await;

        let provider = OpenAiProvider::new(server.uri(), "sk-test").unwrap();
        let results: Vec<_> = provider.chat_stream(&request()).collect().await;
        assert!(matches!(results[0].as_ref(), Err(LlmError::Stream(_))));
    }
}

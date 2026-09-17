//! OpenAI Responses 协议。它与 Chat Completions 使用不同端点、请求和具名事件。

use crate::{
    response_body_error, safe_error_text, streaming_http_client, ChatChunk, ChatRequest, ChatRole,
    LlmError, LlmProvider, MaxOutputField, ReasoningEffort,
};
use async_stream::try_stream;
use futures::{stream::BoxStream, StreamExt};
use serde::Serialize;

#[derive(Serialize)]
struct ResponsesRequest {
    model: String,
    input: Vec<ResponseInput>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning: Option<ResponsesReasoning>,
}

#[derive(Serialize)]
struct ResponsesReasoning {
    effort: ReasoningEffort,
}
#[derive(Serialize)]
struct ResponseInput {
    role: &'static str,
    content: String,
}
pub struct OpenAiResponsesProvider {
    base_url: String,
    api_key: String,
    http: reqwest::Client,
}
impl OpenAiResponsesProvider {
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Result<Self, LlmError> {
        Ok(Self {
            base_url: base_url.into().trim_end_matches('/').into(),
            api_key: api_key.into(),
            http: streaming_http_client()?,
        })
    }
    fn body(&self, request: &ChatRequest) -> ResponsesRequest {
        let instructions = request
            .messages
            .iter()
            .filter(|m| m.role == ChatRole::System)
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        ResponsesRequest {
            model: request.model.clone(),
            input: request
                .messages
                .iter()
                .filter(|m| m.role != ChatRole::System)
                .map(|m| ResponseInput {
                    role: if m.role == ChatRole::Assistant {
                        "assistant"
                    } else {
                        "user"
                    },
                    content: m.content.clone(),
                })
                .collect(),
            stream: true,
            instructions: (!instructions.is_empty()).then_some(instructions),
            max_output_tokens: (request.max_output_field == Some(MaxOutputField::MaxOutputTokens))
                .then_some(request.max_output_tokens)
                .flatten(),
            temperature: request.temperature,
            reasoning: request
                .reasoning_effort
                .map(|effort| ResponsesReasoning { effort }),
        }
    }
}
impl LlmProvider for OpenAiResponsesProvider {
    fn chat_stream<'a>(
        &'a self,
        request: &'a ChatRequest,
    ) -> BoxStream<'a, Result<ChatChunk, LlmError>> {
        let body = self.body(request);
        let endpoint = format!("{}/v1/responses", self.base_url);
        let key = self.api_key.clone();
        try_stream! {
            let response = self
                .http
                .post(endpoint)
                .bearer_auth(&key)
                .json(&body)
                .send()
                .await
                .map_err(|error| {
                    if error.is_timeout() {
                        LlmError::Timeout
                    } else {
                        LlmError::Network(safe_error_text(&error.to_string(), &key))
                    }
                })?;
            let response = if response.status().is_success() {
                response
            } else {
                let status = response.status().as_u16();
                let raw = response.text().await.unwrap_or_default();
                Err(LlmError::Status {
                    status,
                    body: safe_error_text(&raw, &key),
                })?
            };
            let stream_key = key.clone();
            let bytes = response
                .bytes_stream()
                .map(move |item| item.map_err(|error| response_body_error(error, &stream_key)));
            let mut events = crate::sse::parse_events(bytes);
            while let Some(event) = events.next().await {
                let (name, data) = event?;
                match name.as_str() {
                    "response.output_text.delta" => {
                        let value: serde_json::Value = serde_json::from_str(&data)
                            .map_err(|error| LlmError::Stream(format!("JSON 解析失败: {error}")))?;
                        if let Some(delta) = value.get("delta").and_then(serde_json::Value::as_str) {
                            if !delta.is_empty() {
                                yield ChatChunk { delta: delta.into() };
                            }
                        }
                    }
                    "response.failed" | "response.incomplete" | "error" => {
                        Err(LlmError::Stream("Responses 流返回失败事件".into()))?;
                    }
                    _ => {}
                }
            }
        }
        .boxed()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::StreamExt;
    use wiremock::matchers::{body_partial_json, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};
    #[tokio::test]
    async fn sends_responses_request_and_parses_named_delta() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/responses"))
            .and(body_partial_json(serde_json::json!({
                "instructions":"rule",
                "input":[{"role":"user","content":"hi"}],
                "max_output_tokens":12,
                "reasoning":{"effort":"medium"}
            })))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "event: response.output_text.delta\ndata: {\"delta\":\"ok\"}\n\nevent: response.completed\ndata: {}\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;
        let p = OpenAiResponsesProvider::new(server.uri(), "sk-secret").unwrap();
        let mut req = ChatRequest::new(
            "gpt",
            vec![
                crate::ChatMessage::system("rule"),
                crate::ChatMessage::user("hi"),
            ],
        );
        req.max_output_tokens = Some(12);
        req.max_output_field = Some(MaxOutputField::MaxOutputTokens);
        req.reasoning_effort = Some(ReasoningEffort::Medium);
        let parts: Vec<_> = p
            .chat_stream(&req)
            .filter_map(|x| async move { x.ok() })
            .collect()
            .await;
        assert_eq!(parts[0].delta, "ok");
    }

    #[tokio::test]
    async fn redacts_secret_from_status_errors() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/responses"))
            .respond_with(
                ResponseTemplate::new(401).set_body_string("invalid key sk-responses-secret"),
            )
            .mount(&server)
            .await;
        let provider = OpenAiResponsesProvider::new(server.uri(), "sk-responses-secret").unwrap();
        let request = ChatRequest::new("gpt", vec![crate::ChatMessage::user("hi")]);
        let results: Vec<_> = provider.chat_stream(&request).collect().await;
        match results[0].as_ref() {
            Err(LlmError::Status { body, .. }) => {
                assert!(!body.contains("sk-responses-secret"));
                assert!(body.contains("<redacted>"));
            }
            other => panic!("期望状态错误，实际: {other:?}"),
        }
    }

    #[tokio::test]
    async fn surfaces_named_failure_events_as_stream_errors() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/responses"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                "event: response.failed\ndata: {\"type\":\"response.failed\"}\n\n",
                "text/event-stream",
            ))
            .mount(&server)
            .await;
        let provider = OpenAiResponsesProvider::new(server.uri(), "sk-test").unwrap();
        let request = ChatRequest::new("gpt", vec![crate::ChatMessage::user("hi")]);

        let results: Vec<_> = provider.chat_stream(&request).collect().await;

        assert_eq!(results.len(), 1);
        assert!(matches!(results[0], Err(LlmError::Stream(_))));
    }
}

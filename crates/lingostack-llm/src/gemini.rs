//! Google Gemini 原生协议适配器。
//!
//! 端点：`POST {base_url}/v1beta/models/{model}:streamGenerateContent?key={api_key}`
//!
//! 与 OpenAI / Anthropic 的关键差异（均据官方 SDK/适配器实现核对）：
//! - 鉴权用 URL query 参数 `?key=`，而非 header；
//! - 消息在 `contents[]`，assistant 角色名为 **`model`**（非 `assistant`）；
//! - 文本载荷嵌在 `parts[].text`；
//! - system prompt 走顶层 `systemInstruction.parts[].text`；
//! - **流式响应不是 SSE，而是持续写出的 JSON 数组**（`[{...},{...}]`），
//!   故用 [`crate::json_array_stream`] 而非 SSE 解析层；
//! - 增量文本路径 `candidates[0].content.parts[0].text`。

use async_stream::try_stream;
use futures::stream::BoxStream;
use futures::StreamExt;
use serde::{Deserialize, Serialize};

use crate::json_array_stream::parse_json_objects;
use crate::{
    response_body_error, streaming_http_client, ChatChunk, ChatRequest, ChatRole, LlmError,
    LlmProvider,
};

/// Gemini `streamGenerateContent` 请求体。
#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "systemInstruction", skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiSystem>,
    #[serde(rename = "generationConfig", skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
}

#[derive(Serialize)]
struct GeminiContent {
    /// `"user"` 或 `"model"`（Gemini 用 model 表示助手）。
    role: &'static str,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiSystem {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Serialize)]
struct GenerationConfig {
    temperature: f32,
}

/// 流式响应的单个数组元素（仅提取增量文本）。
#[derive(Deserialize)]
struct GeminiStreamChunk {
    #[serde(default)]
    candidates: Vec<GeminiCandidate>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    #[serde(default)]
    content: Option<GeminiRespContent>,
}

#[derive(Deserialize)]
struct GeminiRespContent {
    #[serde(default)]
    parts: Vec<GeminiRespPart>,
}

#[derive(Deserialize)]
struct GeminiRespPart {
    #[serde(default)]
    text: Option<String>,
}

/// Gemini 提供商。
pub struct GeminiProvider {
    base_url: String,
    api_key: String,
    http: reqwest::Client,
}

impl GeminiProvider {
    /// 构造提供商。`base_url` 形如 `https://generativelanguage.googleapis.com`
    /// （不含 `/v1beta/...`）。
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Result<Self, LlmError> {
        let http = streaming_http_client()?;
        Ok(Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
            http,
        })
    }

    /// 端点含模型名与 API Key query 参数。
    fn endpoint(&self, model: &str) -> String {
        format!(
            "{}/v1beta/models/{}:streamGenerateContent?key={}",
            self.base_url, model, self.api_key
        )
    }

    /// 拆分 systemInstruction 与 contents；assistant 映射为 `model`。
    /// 多条 system 消息按换行合并。
    fn build_body(&self, request: &ChatRequest) -> GeminiRequest {
        let mut systems: Vec<&str> = Vec::new();
        let mut contents: Vec<GeminiContent> = Vec::new();
        for m in &request.messages {
            match m.role {
                ChatRole::System => systems.push(m.content.as_str()),
                ChatRole::User => contents.push(GeminiContent {
                    role: "user",
                    parts: vec![GeminiPart {
                        text: m.content.clone(),
                    }],
                }),
                ChatRole::Assistant => contents.push(GeminiContent {
                    role: "model",
                    parts: vec![GeminiPart {
                        text: m.content.clone(),
                    }],
                }),
            }
        }
        GeminiRequest {
            contents,
            system_instruction: if systems.is_empty() {
                None
            } else {
                Some(GeminiSystem {
                    parts: vec![GeminiPart {
                        text: systems.join("\n"),
                    }],
                })
            },
            generation_config: request
                .temperature
                .map(|temperature| GenerationConfig { temperature }),
        }
    }
}

/// 校验响应状态：2xx 放行，否则读 body 包成 [`LlmError::Status`]。
///
/// 注意：Gemini 把 Key 放在 URL query，故错误 body 里可能回显 URL。
/// 这里对 body 做 Key 脱敏，避免 Key 进日志 / 错误提示。
async fn ensure_success(
    resp: reqwest::Response,
    api_key: &str,
) -> Result<reqwest::Response, LlmError> {
    let status = resp.status();
    if status.is_success() {
        Ok(resp)
    } else {
        let code = status.as_u16();
        let raw = resp.text().await.unwrap_or_default();
        let body = if api_key.is_empty() {
            raw
        } else {
            raw.replace(api_key, "<redacted>")
        };
        Err(LlmError::Status { status: code, body })
    }
}

impl LlmProvider for GeminiProvider {
    fn chat_stream<'a>(
        &'a self,
        request: &'a ChatRequest,
    ) -> BoxStream<'a, Result<ChatChunk, LlmError>> {
        let body = self.build_body(request);
        let url = self.endpoint(&request.model);
        let api_key = self.api_key.clone();
        try_stream! {
            let resp = self
                .http
                .post(url)
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    if e.is_timeout() {
                        LlmError::Timeout
                    } else {
                        // reqwest 的错误消息可能含 URL（内含 Key），做脱敏。
                        LlmError::Network(
                            e.to_string().replace(self.api_key.as_str(), "<redacted>"),
                        )
                    }
                })?;
            let resp = ensure_success(resp, &self.api_key).await?;
            let bytes = resp
                .bytes_stream()
                .map(move |result| result.map_err(|error| response_body_error(error, &api_key)));
            let mut objects = parse_json_objects(bytes);
            while let Some(object) = objects.next().await {
                let object = object?;
                let parsed: GeminiStreamChunk = serde_json::from_str(&object)
                    .map_err(|e| LlmError::Stream(format!("JSON 解析失败: {e}")))?;
                let text = parsed
                    .candidates
                    .into_iter()
                    .next()
                    .and_then(|c| c.content)
                    .and_then(|c| c.parts.into_iter().next())
                    .and_then(|p| p.text);
                if let Some(text) = text {
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
    use wiremock::matchers::{body_partial_json, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn request() -> ChatRequest {
        ChatRequest::new(
            "gemini-2.5-flash",
            vec![ChatMessage::system("你是翻译"), ChatMessage::user("hello")],
        )
    }

    /// 真实 Gemini 流式响应：JSON 数组（非 SSE）。
    const ARRAY_STREAM: &str = concat!(
        "[{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hello\"}],\"role\":\"model\"}}]},\n",
        "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\" world\"}],\"role\":\"model\"}}]}]",
    );

    const ENDPOINT_PATH: &str = "/v1beta/models/gemini-2.5-flash:streamGenerateContent";

    async fn deltas_of(server: &MockServer, req: &ChatRequest) -> Vec<String> {
        let provider = GeminiProvider::new(server.uri(), "gk-test").unwrap();
        provider
            .chat_stream(req)
            .filter_map(|r| async move { r.ok() })
            .map(|c| c.delta)
            .collect()
            .await
    }

    #[tokio::test]
    async fn streams_deltas_with_key_in_query() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path(ENDPOINT_PATH))
            .and(query_param("key", "gk-test"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(ARRAY_STREAM, "application/json"))
            .mount(&server)
            .await;
        assert_eq!(deltas_of(&server, &request()).await.concat(), "Hello world");
    }

    #[tokio::test]
    async fn preserves_translation_envelope_after_gemini_normalization() {
        let server = MockServer::start().await;
        let envelope = "译文\n<<<LINGOSTACK_TERMS_V1>>>\n[]";
        let stream = serde_json::json!([
            {"candidates":[{"content":{"parts":[{"text": envelope}]}}]}
        ])
        .to_string();
        Mock::given(method("POST"))
            .and(path(ENDPOINT_PATH))
            .respond_with(ResponseTemplate::new(200).set_body_raw(stream, "application/json"))
            .mount(&server)
            .await;
        let output = deltas_of(&server, &request()).await.concat();
        assert_eq!(output, envelope);
    }

    #[tokio::test]
    async fn body_uses_contents_parts_and_system_instruction() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path(ENDPOINT_PATH))
            .and(body_partial_json(serde_json::json!({
                "contents": [{ "role": "user", "parts": [{ "text": "hello" }] }],
                "systemInstruction": { "parts": [{ "text": "你是翻译" }] }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_raw(ARRAY_STREAM, "application/json"))
            .mount(&server)
            .await;
        assert_eq!(deltas_of(&server, &request()).await.concat(), "Hello world");
    }

    #[tokio::test]
    async fn maps_assistant_role_to_model() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path(ENDPOINT_PATH))
            .and(body_partial_json(serde_json::json!({
                "contents": [
                    { "role": "user", "parts": [{ "text": "hi" }] },
                    { "role": "model", "parts": [{ "text": "你好" }] }
                ]
            })))
            .respond_with(ResponseTemplate::new(200).set_body_raw(ARRAY_STREAM, "application/json"))
            .mount(&server)
            .await;
        let req = ChatRequest::new(
            "gemini-2.5-flash",
            vec![
                ChatMessage::user("hi"),
                ChatMessage {
                    role: ChatRole::Assistant,
                    content: "你好".into(),
                },
            ],
        );
        assert_eq!(deltas_of(&server, &req).await.concat(), "Hello world");
    }

    #[tokio::test]
    async fn omits_system_instruction_when_absent() {
        let provider = GeminiProvider::new("https://x", "gk-test").unwrap();
        let req = ChatRequest::new("gemini-2.5-flash", vec![ChatMessage::user("hi")]);
        let body = provider.build_body(&req);
        assert!(body.system_instruction.is_none());
        let json = serde_json::to_string(&body).unwrap();
        assert!(!json.contains("systemInstruction"));
        // temperature 未设时不应出现 generationConfig
        assert!(!json.contains("generationConfig"));
    }

    #[tokio::test]
    async fn skips_chunks_without_text() {
        // 首个元素无 parts（如仅含 safetyRatings），须跳过而不产出空 chunk。
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path(ENDPOINT_PATH))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                concat!(
                    "[{\"candidates\":[{\"safetyRatings\":[]}]},",
                    "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"ok\"}]}}]}]",
                ),
                "application/json",
            ))
            .mount(&server)
            .await;
        assert_eq!(deltas_of(&server, &request()).await, vec!["ok".to_string()]);
    }

    #[tokio::test]
    async fn surfaces_non_ok_status_with_key_redacted() {
        // Gemini 的 Key 在 URL query，错误 body 可能回显；须脱敏。
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path(ENDPOINT_PATH))
            .respond_with(ResponseTemplate::new(400).set_body_string(
                "API key not valid: gk-test (see https://host/v1beta?key=gk-test)",
            ))
            .mount(&server)
            .await;
        let provider = GeminiProvider::new(server.uri(), "gk-test").unwrap();
        let results: Vec<_> = provider.chat_stream(&request()).collect().await;
        match results[0].as_ref() {
            Err(LlmError::Status { status, body }) => {
                assert_eq!(*status, 400);
                assert!(
                    !body.contains("gk-test"),
                    "API Key 不得出现在错误里: {body}"
                );
                assert!(body.contains("<redacted>"));
            }
            other => panic!("期望 Status 错误，实际: {other:?}"),
        }
    }

    #[tokio::test]
    async fn leaves_status_body_readable_when_api_key_is_empty() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path(ENDPOINT_PATH))
            .respond_with(ResponseTemplate::new(401).set_body_string("missing API key"))
            .mount(&server)
            .await;
        let provider = GeminiProvider::new(server.uri(), "").unwrap();
        let results: Vec<_> = provider.chat_stream(&request()).collect().await;
        match results[0].as_ref() {
            Err(LlmError::Status { status, body }) => {
                assert_eq!(*status, 401);
                assert_eq!(body, "missing API key");
            }
            other => panic!("期望 Status 错误，实际: {other:?}"),
        }
    }

    #[tokio::test]
    async fn surfaces_stream_json_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path(ENDPOINT_PATH))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_raw("[{\"candidates\":\"not-an-array\"}]", "application/json"),
            )
            .mount(&server)
            .await;
        let provider = GeminiProvider::new(server.uri(), "gk-test").unwrap();
        let results: Vec<_> = provider.chat_stream(&request()).collect().await;
        assert!(matches!(results[0].as_ref(), Err(LlmError::Stream(_))));
    }
}

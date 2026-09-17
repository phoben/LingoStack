//! 显式模型发现 HTTP 入口；不会保存配置，也不会把 ID 列表伪装成能力证明。

use crate::{safe_error_text, LlmError};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryKind {
    OpenAi,
    Anthropic,
    Gemini,
    OllamaTags,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryRequest {
    pub kind: DiscoveryKind,
    pub endpoint: String,
    pub api_key: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiscoveredModel {
    pub id: String,
    pub context_window: Option<u32>,
    pub max_output_tokens: Option<u32>,
}

pub async fn discover_models(request: DiscoveryRequest) -> Result<Vec<DiscoveredModel>, LlmError> {
    let client = crate::streaming_http_client()?;
    let endpoint = request.endpoint.trim_end_matches('/');
    let base_url = match request.kind {
        DiscoveryKind::OpenAi if endpoint.ends_with("/v1") || endpoint.ends_with("/v4") => {
            format!("{endpoint}/models")
        }
        DiscoveryKind::OpenAi => format!("{endpoint}/v1/models"),
        DiscoveryKind::Anthropic => format!("{endpoint}/v1/models"),
        DiscoveryKind::Gemini => format!("{endpoint}/v1beta/models"),
        DiscoveryKind::OllamaTags => format!("{endpoint}/api/tags"),
    };
    let mut url = base_url;
    let mut models = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_cursors = HashSet::new();
    loop {
        let mut call = client.get(&url);
        match request.kind {
            DiscoveryKind::OpenAi if !request.api_key.is_empty() => {
                call = call.bearer_auth(&request.api_key);
            }
            DiscoveryKind::Anthropic => {
                call = call
                    .header("x-api-key", &request.api_key)
                    .header("anthropic-version", ANTHROPIC_VERSION);
            }
            DiscoveryKind::Gemini => {
                call = call.header("x-goog-api-key", &request.api_key);
            }
            DiscoveryKind::OpenAi | DiscoveryKind::OllamaTags => {}
        }
        let response = call
            .send()
            .await
            .map_err(|e| LlmError::Network(safe_error_text(&e.to_string(), &request.api_key)))?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let raw = response.text().await.unwrap_or_default();
            let body = safe_error_text(&raw, &request.api_key);
            return Err(LlmError::Status { status, body });
        }
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|e| LlmError::Stream(format!("模型列表 JSON 解析失败: {e}")))?;
        let values = match request.kind {
            DiscoveryKind::Gemini => value.get("models").and_then(serde_json::Value::as_array),
            DiscoveryKind::OllamaTags => value.get("models").and_then(serde_json::Value::as_array),
            _ => value.get("data").and_then(serde_json::Value::as_array),
        }
        .ok_or_else(|| LlmError::Stream("模型列表格式不符合协议".into()))?;
        models.extend(values.iter().filter_map(|item| {
            if matches!(request.kind, DiscoveryKind::Gemini)
                && !item
                    .get("supportedGenerationMethods")
                    .and_then(serde_json::Value::as_array)
                    .is_some_and(|methods| {
                        methods
                            .iter()
                            .any(|method| method.as_str() == Some("generateContent"))
                    })
            {
                return None;
            }
            let id = item
                .get("id")
                .or_else(|| item.get("name"))
                .or_else(|| item.get("model"))
                .and_then(serde_json::Value::as_str)
                .map(|id| id.trim_start_matches("models/"))?;
            seen_ids.insert(id.to_owned()).then(|| DiscoveredModel {
                id: id.into(),
                context_window: item
                    .get("inputTokenLimit")
                    .and_then(serde_json::Value::as_u64)
                    .map(|v| v as u32),
                max_output_tokens: item
                    .get("outputTokenLimit")
                    .and_then(serde_json::Value::as_u64)
                    .map(|v| v as u32),
            })
        }));
        // Anthropic 返回 `has_more` 与 `last_id`；第二页失败会整体失败，调用方因此保留草稿。
        if matches!(request.kind, DiscoveryKind::Anthropic)
            && value
                .get("has_more")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false)
        {
            let last_id = value
                .get("last_id")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| LlmError::Stream("Anthropic 分页缺少 last_id".into()))?;
            if !seen_cursors.insert(last_id.to_owned()) {
                return Err(LlmError::Stream("Anthropic 分页游标重复".into()));
            }
            let mut next = reqwest::Url::parse(&format!("{endpoint}/v1/models"))
                .map_err(|error| LlmError::Network(format!("模型发现端点无效: {error}")))?;
            next.query_pairs_mut().append_pair("after_id", last_id);
            url = next.into();
            continue;
        }
        return Ok(models);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path, query_param, query_param_is_missing};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn anthropic_discovery_follows_cursor_pages() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .and(query_param_is_missing("after_id"))
            .and(header("x-api-key", "sk-test"))
            .and(header("anthropic-version", ANTHROPIC_VERSION))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!({"data":[{"id":"one"}],"has_more":true,"last_id":"one"}),
            ))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .and(query_param("after_id", "one"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"data":[{"id":"two"}],"has_more":false})),
            )
            .mount(&server)
            .await;
        let models = discover_models(DiscoveryRequest {
            kind: DiscoveryKind::Anthropic,
            endpoint: server.uri(),
            api_key: "sk-test".into(),
        })
        .await
        .unwrap();
        assert_eq!(
            models
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec!["one", "two"]
        );
    }

    #[tokio::test]
    async fn gemini_uses_header_filters_non_generation_models_and_keeps_limits() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1beta/models"))
            .and(header("x-goog-api-key", "gk-secret"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "models": [
                    {
                        "name": "models/gemini-text",
                        "supportedGenerationMethods": ["generateContent"],
                        "inputTokenLimit": 1024,
                        "outputTokenLimit": 256
                    },
                    {
                        "name": "models/embedding-only",
                        "supportedGenerationMethods": ["embedContent"]
                    }
                ]
            })))
            .mount(&server)
            .await;

        let models = discover_models(DiscoveryRequest {
            kind: DiscoveryKind::Gemini,
            endpoint: server.uri(),
            api_key: "gk-secret".into(),
        })
        .await
        .unwrap();

        assert_eq!(
            models,
            vec![DiscoveredModel {
                id: "gemini-text".into(),
                context_window: Some(1024),
                max_output_tokens: Some(256),
            }]
        );
    }

    #[tokio::test]
    async fn status_error_redacts_key_and_truncates_body() {
        let server = MockServer::start().await;
        let body = format!("gk-secret {}", "x".repeat(3_000));
        Mock::given(method("GET"))
            .and(path("/v1beta/models"))
            .respond_with(ResponseTemplate::new(401).set_body_string(body))
            .mount(&server)
            .await;

        let error = discover_models(DiscoveryRequest {
            kind: DiscoveryKind::Gemini,
            endpoint: server.uri(),
            api_key: "gk-secret".into(),
        })
        .await
        .unwrap_err();
        match error {
            LlmError::Status { body, .. } => {
                assert!(!body.contains("gk-secret"));
                assert!(body.chars().count() <= 2_049);
            }
            other => panic!("期望状态错误，实际: {other:?}"),
        }
    }

    #[tokio::test]
    async fn openai_style_discovery_respects_a_versioned_base_url() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .and(header("authorization", "Bearer sk-test"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"data":[{"id":"MiniMax-M2"}]})),
            )
            .mount(&server)
            .await;
        let models = discover_models(DiscoveryRequest {
            kind: DiscoveryKind::OpenAi,
            endpoint: format!("{}/v1", server.uri()),
            api_key: "sk-test".into(),
        })
        .await
        .unwrap();
        assert_eq!(models[0].id, "MiniMax-M2");
    }

    #[tokio::test]
    async fn empty_discovery_result_is_a_successful_empty_list() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"data":[]})))
            .mount(&server)
            .await;

        let models = discover_models(DiscoveryRequest {
            kind: DiscoveryKind::OpenAi,
            endpoint: server.uri(),
            api_key: String::new(),
        })
        .await
        .unwrap();

        assert!(models.is_empty());
    }

    #[tokio::test]
    async fn discovery_rejects_malformed_json() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_raw("{", "application/json"))
            .mount(&server)
            .await;

        let error = discover_models(DiscoveryRequest {
            kind: DiscoveryKind::OpenAi,
            endpoint: server.uri(),
            api_key: String::new(),
        })
        .await
        .unwrap_err();

        assert!(matches!(error, LlmError::Stream(_)));
    }

    #[tokio::test]
    async fn discovery_deduplicates_ids_without_inventing_capabilities() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/tags"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "models": [{"name":"qwen3"}, {"name":"qwen3"}]
            })))
            .mount(&server)
            .await;

        let models = discover_models(DiscoveryRequest {
            kind: DiscoveryKind::OllamaTags,
            endpoint: server.uri(),
            api_key: String::new(),
        })
        .await
        .unwrap();

        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, "qwen3");
        assert_eq!(models[0].context_window, None);
        assert_eq!(models[0].max_output_tokens, None);
    }

    #[tokio::test]
    async fn anthropic_discovery_fails_the_whole_refresh_when_a_later_page_fails() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .and(query_param_is_missing("after_id"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!({"data":[{"id":"one"}],"has_more":true,"last_id":"one"}),
            ))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .and(query_param("after_id", "one"))
            .respond_with(ResponseTemplate::new(503).set_body_string("temporary"))
            .mount(&server)
            .await;

        let error = discover_models(DiscoveryRequest {
            kind: DiscoveryKind::Anthropic,
            endpoint: server.uri(),
            api_key: "sk-test".into(),
        })
        .await
        .unwrap_err();

        assert!(matches!(error, LlmError::Status { status: 503, .. }));
    }
}

//! 随应用发布的提供商预设目录。预设只用于新实例化，不参与运行时品牌分支。

use crate::config::{
    AuthScheme, Feature, MaxOutputField, ModelDescriptor, ModelOrigin, ParameterProfile, Protocol,
    ProviderInstance, SourcedValue, ValueSource,
};

/// 模型发现实现类型；网络层据此选择固定的协议解析器。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryKind {
    OpenAi,
    Anthropic,
    Gemini,
    OllamaTags,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct DiscoveryProfile {
    pub kind: DiscoveryKind,
    pub endpoint: String,
}

/// 可公开传输给设置页的预设，不包含密钥或用户实例。
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProviderPreset {
    pub id: &'static str,
    pub brand: &'static str,
    pub display_name: &'static str,
    pub protocol: Protocol,
    pub suggested_endpoints: &'static [&'static str],
    pub auth: AuthScheme,
    pub docs_url: &'static str,
    pub discovery: Option<DiscoveryKind>,
    pub initial_model_ids: &'static [&'static str],
}

const PRESETS: [ProviderPreset; 9] = [
    ProviderPreset {
        id: "openai-chat",
        brand: "OpenAI",
        display_name: "OpenAI Chat Completions",
        protocol: Protocol::OpenAiChatCompletions,
        suggested_endpoints: &["https://api.openai.com"],
        auth: AuthScheme::Bearer,
        docs_url: "https://platform.openai.com/docs/api-reference/chat",
        discovery: Some(DiscoveryKind::OpenAi),
        initial_model_ids: &["gpt-4o-mini"],
    },
    ProviderPreset {
        id: "openai-responses",
        brand: "OpenAI",
        display_name: "OpenAI Responses",
        protocol: Protocol::OpenAiResponses,
        suggested_endpoints: &["https://api.openai.com"],
        auth: AuthScheme::Bearer,
        docs_url: "https://platform.openai.com/docs/api-reference/responses",
        discovery: Some(DiscoveryKind::OpenAi),
        initial_model_ids: &["gpt-4o-mini", "o3-mini"],
    },
    ProviderPreset {
        id: "anthropic",
        brand: "Anthropic",
        display_name: "Anthropic Claude",
        protocol: Protocol::AnthropicMessages,
        suggested_endpoints: &["https://api.anthropic.com"],
        auth: AuthScheme::AnthropicApiKey,
        docs_url: "https://docs.anthropic.com/en/api/models-list",
        discovery: Some(DiscoveryKind::Anthropic),
        initial_model_ids: &["claude-sonnet-4-5"],
    },
    ProviderPreset {
        id: "gemini",
        brand: "Google",
        display_name: "Gemini",
        protocol: Protocol::GeminiGenerateContent,
        suggested_endpoints: &["https://generativelanguage.googleapis.com"],
        auth: AuthScheme::GeminiApiKey,
        docs_url: "https://ai.google.dev/api/models",
        discovery: Some(DiscoveryKind::Gemini),
        initial_model_ids: &["gemini-2.5-flash"],
    },
    ProviderPreset {
        id: "deepseek",
        brand: "DeepSeek",
        display_name: "DeepSeek",
        protocol: Protocol::OpenAiChatCompletions,
        suggested_endpoints: &["https://api.deepseek.com"],
        auth: AuthScheme::Bearer,
        docs_url: "https://api-docs.deepseek.com/",
        discovery: Some(DiscoveryKind::OpenAi),
        initial_model_ids: &["deepseek-chat"],
    },
    ProviderPreset {
        id: "zhipu",
        brand: "智谱 AI",
        display_name: "智谱普通 API",
        protocol: Protocol::OpenAiChatCompletions,
        suggested_endpoints: &["https://open.bigmodel.cn/api/paas/v4"],
        auth: AuthScheme::Bearer,
        docs_url: "https://open.bigmodel.cn/dev/api",
        discovery: None,
        initial_model_ids: &["glm-4.5"],
    },
    ProviderPreset {
        id: "minimax",
        brand: "MiniMax",
        display_name: "MiniMax",
        protocol: Protocol::OpenAiChatCompletions,
        suggested_endpoints: &["https://api.minimax.io/v1"],
        auth: AuthScheme::Bearer,
        docs_url: "https://platform.minimax.io/docs",
        discovery: Some(DiscoveryKind::OpenAi),
        initial_model_ids: &["MiniMax-M2"],
    },
    ProviderPreset {
        id: "bailian",
        brand: "阿里云",
        display_name: "阿里百炼 / 通义",
        protocol: Protocol::OpenAiChatCompletions,
        suggested_endpoints: &[
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        ],
        auth: AuthScheme::Bearer,
        docs_url: "https://help.aliyun.com/zh/model-studio/",
        discovery: None,
        initial_model_ids: &["qwen-plus"],
    },
    ProviderPreset {
        id: "ollama",
        brand: "Ollama",
        display_name: "Ollama（OpenAI 兼容）",
        protocol: Protocol::OpenAiChatCompletions,
        suggested_endpoints: &["http://localhost:11434"],
        auth: AuthScheme::None,
        docs_url: "https://docs.ollama.com/api/openai-compatibility",
        discovery: Some(DiscoveryKind::OllamaTags),
        initial_model_ids: &["llama3.2"],
    },
];

#[must_use]
pub fn provider_presets() -> &'static [ProviderPreset] {
    &PRESETS
}

#[must_use]
pub fn instantiate_preset(id: &str) -> Option<ProviderInstance> {
    let preset = PRESETS.iter().find(|preset| preset.id == id)?;
    Some(ProviderInstance {
        id: String::new(),
        preset_id: Some(id.into()),
        name: preset.display_name.into(),
        protocol: preset.protocol,
        base_url: preset.suggested_endpoints[0].into(),
        api_key: String::new(),
        auth: preset.auth,
        parameter_profile: default_profile(preset),
        models: initial_models(id),
    })
}

fn default_profile(preset: &ProviderPreset) -> Option<ParameterProfile> {
    let field = match preset.id {
        "openai-chat" => Some(MaxOutputField::MaxCompletionTokens),
        "deepseek" | "zhipu" | "minimax" | "bailian" | "ollama" => Some(MaxOutputField::MaxTokens),
        _ => match preset.protocol {
            Protocol::OpenAiResponses => Some(MaxOutputField::MaxOutputTokens),
            Protocol::AnthropicMessages => Some(MaxOutputField::MaxTokens),
            Protocol::GeminiGenerateContent => Some(MaxOutputField::GeminiMaxOutputTokens),
            Protocol::OpenAiChatCompletions => None,
        },
    };
    Some(ParameterProfile {
        protocol: preset.protocol,
        endpoint_scope: preset.suggested_endpoints[0].into(),
        supports_temperature: true,
        max_output_field: field,
        supports_reasoning: matches!(preset.protocol, Protocol::OpenAiResponses),
    })
}

fn initial_models(id: &str) -> Vec<ModelDescriptor> {
    let Some(preset) = PRESETS.iter().find(|preset| preset.id == id) else {
        return Vec::new();
    };
    preset
        .initial_model_ids
        .iter()
        .map(|model| ModelDescriptor {
            id: (*model).into(),
            origin: ModelOrigin::BundledVerified,
            source_url: Some(preset.docs_url.into()),
            verified_at: Some("2026-09-17".into()),
            display_name: None,
            supported_features: vec![
                Feature::Translate,
                Feature::Naming,
                Feature::Explain,
                Feature::DocTranslate,
            ],
            context_window: None,
            max_output_tokens: None,
            supports_temperature: *model != "o3-mini",
            supports_max_output: true,
            supports_reasoning: *model == "o3-mini",
        })
        .collect()
}

/// 只有预设 id、协议、端点三项仍吻合时，才允许读取在线模型列表。
#[must_use]
pub fn discovery_profile_for(instance: &ProviderInstance) -> Option<DiscoveryProfile> {
    let preset = PRESETS
        .iter()
        .find(|p| Some(p.id) == instance.preset_id.as_deref())?;
    if preset.protocol != instance.protocol
        || !preset
            .suggested_endpoints
            .contains(&instance.base_url.as_str())
    {
        return None;
    }
    let kind = preset.discovery?;
    Some(DiscoveryProfile {
        kind,
        endpoint: instance.base_url.clone(),
    })
}

/// 远端数据仅补充缺失模型；用户和内置审核值永远不被覆盖，也从不删除旧模型。
#[must_use]
pub fn merge_discovered_models(
    existing: &[ModelDescriptor],
    discovered: &[ModelDescriptor],
) -> Vec<ModelDescriptor> {
    let mut merged = existing.to_vec();
    for candidate in discovered {
        if let Some(current) = merged.iter_mut().find(|model| model.id == candidate.id) {
            merge_provider_value(&mut current.context_window, &candidate.context_window);
            merge_provider_value(&mut current.max_output_tokens, &candidate.max_output_tokens);
        } else {
            merged.push(candidate.clone());
        }
    }
    merged
}

fn merge_provider_value<T: Clone>(
    current: &mut Option<SourcedValue<T>>,
    candidate: &Option<SourcedValue<T>>,
) {
    let can_replace = current
        .as_ref()
        .is_none_or(|value| value.source == ValueSource::ProviderReported);
    if can_replace && candidate.is_some() {
        *current = candidate.clone();
    }
}

/// 生成 ID 级候选，绝不伪装为已验证能力。
#[must_use]
pub fn discovered_candidate(id: String) -> ModelDescriptor {
    discovered_candidate_with_limits(id, None, None)
}

/// 生成提供商返回的候选；只有响应实际给出的限制才带 `provider_reported` 来源。
#[must_use]
pub fn discovered_candidate_with_limits(
    id: String,
    context_window: Option<u32>,
    max_output_tokens: Option<u32>,
) -> ModelDescriptor {
    ModelDescriptor {
        id,
        origin: ModelOrigin::ProviderReported,
        source_url: None,
        verified_at: None,
        display_name: None,
        supported_features: vec![
            Feature::Translate,
            Feature::Naming,
            Feature::Explain,
            Feature::DocTranslate,
        ],
        context_window: context_window.map(|value| SourcedValue {
            value,
            source: ValueSource::ProviderReported,
            source_url: None,
            verified_at: None,
        }),
        max_output_tokens: max_output_tokens.map(|value| SourcedValue {
            value,
            source: ValueSource::ProviderReported,
            source_url: None,
            verified_at: None,
        }),
        supports_temperature: false,
        supports_max_output: max_output_tokens.is_some(),
        supports_reasoning: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn presets_have_unique_ids_and_custom_is_not_a_preset() {
        let mut ids = std::collections::BTreeSet::new();
        assert!(provider_presets().iter().all(|p| ids.insert(p.id)));
        assert_eq!(provider_presets().len(), 9);
    }
    #[test]
    fn instantiation_is_independent_and_discovery_requires_exact_match() {
        let mut first = instantiate_preset("openai-chat").unwrap();
        let second = instantiate_preset("openai-chat").unwrap();
        first.name = "mine".into();
        assert_ne!(first.name, second.name);
        assert!(discovery_profile_for(&second).is_some());
        first.base_url = "https://proxy.example".into();
        assert!(discovery_profile_for(&first).is_none());
    }
    #[test]
    fn merge_never_deletes_or_overwrites_existing_models() {
        let mut old = instantiate_preset("deepseek").unwrap().models;
        old[0].context_window = Some(SourcedValue {
            value: 128_000,
            source: ValueSource::UserOverride,
            source_url: None,
            verified_at: None,
        });
        let discovered_existing =
            discovered_candidate_with_limits(old[0].id.clone(), Some(64_000), Some(8_000));
        let merged = merge_discovered_models(
            &old,
            &[discovered_existing, discovered_candidate("new".into())],
        );
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].id, old[0].id);
        assert_eq!(merged[0].context_window.as_ref().unwrap().value, 128_000);
        assert_eq!(
            merged[0].max_output_tokens.as_ref().unwrap().source,
            ValueSource::ProviderReported
        );
    }
}

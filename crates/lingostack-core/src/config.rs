//! 应用配置模型与模型解析（设计文档 §6 / §8）。
//!
//! 配置由 Rust 侧读写、序列化为 JSON（文件权限 `0600`，见 `lingostack-app`）。
//! API Key 必须写入文件（运行需要），但任何调试输出都会脱敏——由
//! [`ProviderConfig`] 自定义的 `Debug` 实现保证，配合 [`ProviderConfig::redact`]
//! 给出可展示的首尾预览。

use std::collections::HashSet;
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::hotkey::{self, HotkeyBinding};
use crate::lang::Language;
use crate::naming::NamingStyle;
use crate::prompt::PromptOverrides;

/// LLM 请求协议，决定请求体格式与响应流的解析方式。
#[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Protocol {
    /// OpenAI Chat Completions（也用于 Ollama 的兼容面）。
    #[default]
    OpenAiChatCompletions,
    /// OpenAI Responses，仅允许官方端点。
    OpenAiResponses,
    /// Anthropic Messages。
    AnthropicMessages,
    /// Google Gemini Generate Content。
    GeminiGenerateContent,
}

/// 认证方式。认证策略属于实例，不由品牌名称隐式推断。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthScheme {
    Bearer,
    AnthropicApiKey,
    GeminiApiKey,
    None,
}

/// 提供商/用户给出的规格来源。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValueSource {
    BundledVerified,
    ProviderReported,
    UserOverride,
}

/// 模型条目本身的来源。远端只返回 ID 时也必须保留其来源，不能伪装成内置审核数据。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelOrigin {
    BundledVerified,
    ProviderReported,
    UserEntered,
}

/// 带来源的模型规格。用户覆盖永远优先于在线发现。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourcedValue<T> {
    pub value: T,
    pub source: ValueSource,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verified_at: Option<String>,
}

/// 已审核的参数字段映射。未匹配 profile 时一律不发送可选参数。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaxOutputField {
    MaxTokens,
    MaxCompletionTokens,
    MaxOutputTokens,
    GeminiMaxOutputTokens,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParameterProfile {
    pub protocol: Protocol,
    pub endpoint_scope: String,
    #[serde(default)]
    pub supports_temperature: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_field: Option<MaxOutputField>,
    #[serde(default)]
    pub supports_reasoning: bool,
}

/// 单个模型的可调用能力及规格。手工模型可用但标明未核验。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelDescriptor {
    pub id: String,
    pub origin: ModelOrigin,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verified_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default)]
    pub supported_features: Vec<Feature>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<SourcedValue<u32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<SourcedValue<u32>>,
    #[serde(default)]
    pub supports_temperature: bool,
    #[serde(default)]
    pub supports_max_output: bool,
    #[serde(default)]
    pub supports_reasoning: bool,
}

/// 功能分配的封闭式生成设置，禁止透传任意高级参数字典。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct GenerationSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningEffort {
    Low,
    Medium,
    High,
}

/// 一个 LLM 提供商实例。用户可配多个同协议实例（如两个 DeepSeek 账号）。
///
/// `Debug` 实现自动把 `api_key` 显示为 `"<redacted>"`，杜绝 Key 泄漏进
/// 日志 / 错误 / 崩溃报告。
#[derive(Clone, Serialize, Deserialize)]
pub struct ProviderInstance {
    /// 用户定义的唯一 id（如 `"deepseek-1"`），模型引用据此关联。
    pub id: String,
    /// 协议类型。
    pub protocol: Protocol,
    /// 创建来源，仅用于展示、发现资格和审计；运行时不反查预设覆盖实例。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset_id: Option<String>,
    /// 显示名（如 `"DeepSeek"`）。
    pub name: String,
    /// API 基地址（如 `https://api.deepseek.com`）。
    pub base_url: String,
    /// API Key（敏感）。调试输出自动脱敏；需展示首尾预览用 [`redact`](Self::redact)。
    pub api_key: String,
    pub auth: AuthScheme,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parameter_profile: Option<ParameterProfile>,
    /// 可用模型及其能力。
    #[serde(default)]
    pub models: Vec<ModelDescriptor>,
}

impl fmt::Debug for ProviderInstance {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProviderInstance")
            .field("id", &self.id)
            .field("protocol", &self.protocol)
            .field("name", &self.name)
            .field("base_url", &self.base_url)
            .field("api_key", &"<redacted>")
            .field("models", &self.models)
            .finish()
    }
}

impl ProviderInstance {
    /// 返回脱敏视图（含 Key 首尾预览），用于 UI「已配置」提示或详细日志。
    #[must_use]
    pub fn redact(&self) -> RedactedProvider<'_> {
        RedactedProvider {
            id: &self.id,
            protocol: self.protocol,
            name: &self.name,
            base_url: &self.base_url,
            api_key_preview: mask_secret(&self.api_key),
            models: self.models.as_slice(),
        }
    }
}

/// [`ProviderConfig`] 的脱敏视图：Key 仅保留首尾预览。
#[derive(Debug, Clone)]
pub struct RedactedProvider<'a> {
    pub id: &'a str,
    pub protocol: Protocol,
    pub name: &'a str,
    pub base_url: &'a str,
    pub api_key_preview: String,
    pub models: &'a [ModelDescriptor],
}

/// 兼容旧调用点的类型别名；JSON schema 已由 `schema_version` 严格隔离。
pub type ProviderConfig = ProviderInstance;

/// Key 脱敏：长度 ≤ 8 全掩码；否则首 2 位 + 星号 + 末 2 位。
fn mask_secret(secret: &str) -> String {
    let chars: Vec<char> = secret.chars().collect();
    let n = chars.len();
    if n <= 8 {
        return "********".to_string();
    }
    let head: String = chars[..2].iter().collect();
    let tail: String = chars[n - 2..].iter().collect();
    format!("{head}{}{tail}", "*".repeat(n - 4))
}

/// 指向某提供商的某个模型。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ModelRef {
    pub provider_id: String,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generation: Option<GenerationSettings>,
}

/// AI 功能。每功能可指定默认模型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Feature {
    Translate,
    Naming,
    Explain,
    /// 文档翻译（V1.5 落地，字段先留）。
    DocTranslate,
}

/// 每功能的模型分配。任一为 `None` 表示未指定，解析时按 §6.1 回退。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ModelAssignment {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub translate: Option<ModelRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub naming: Option<ModelRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explain: Option<ModelRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub doc_translate: Option<ModelRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub global_default: Option<ModelRef>,
}

/// 模型解析错误。
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ResolveError {
    #[error("配置版本不兼容（检测到 {found}），请重新配置 AI 提供商")]
    UnsupportedSchema { found: u32 },
    /// 功能既无默认模型也无全局兜底。
    #[error("功能 {feature:?} 未配置默认模型，亦无全局兜底")]
    Unassigned { feature: Feature },
    /// 模型引用的 `provider_id` 不存在（配置不一致）。
    #[error("模型引用的提供商 `{provider_id}` 不存在")]
    UnknownProvider { provider_id: String },
    #[error("模型 `{model}` 不存在于当前提供商配置中")]
    UnknownModel { model: String },
    #[error("模型 `{model}` 不支持功能 {feature:?}")]
    FeatureUnsupported { feature: Feature, model: String },
    #[error("模型或协议不支持参数 `{parameter}`")]
    ParameterUnsupported { parameter: String },
    #[error("参数 `{parameter}` 的值无效")]
    ParameterInvalid { parameter: String },
    #[error("OpenAI Responses 首期仅支持 OpenAI 官方预设与官方端点")]
    ResponsesEndpointUnsupported,
}

impl ModelAssignment {
    /// 按 §6.1 解析：功能默认 → 全局默认 → [`ResolveError::Unassigned`]。
    pub fn resolve(&self, feature: Feature) -> Result<&ModelRef, ResolveError> {
        let feature_default = match feature {
            Feature::Translate => &self.translate,
            Feature::Naming => &self.naming,
            Feature::Explain => &self.explain,
            Feature::DocTranslate => &self.doc_translate,
        };
        feature_default
            .as_ref()
            .or(self.global_default.as_ref())
            .ok_or(ResolveError::Unassigned { feature })
    }
}

/// 外观主题。
#[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

/// 主窗口显示语言。旧配置的 `zh` / `en` 仍可直接读取。
#[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UiLanguage {
    #[default]
    System,
    #[serde(alias = "zh")]
    Zh,
    #[serde(alias = "en", alias = "ja")]
    En,
}

impl UiLanguage {
    /// 后端没有浏览器 locale；调用方可传入浏览器已解析的 system 语言。
    #[must_use]
    pub fn translation_language(self, effective_system_language: Option<Language>) -> Language {
        match self {
            Self::Zh => Language::Zh,
            Self::En => Language::En,
            Self::System => effective_system_language.unwrap_or(Language::En),
        }
    }
}

/// 应用配置根。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// 破坏性 provider schema 的显式版本；缺失版本绝不按新配置静默解释。
    pub schema_version: u32,
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,
    #[serde(default)]
    pub models: ModelAssignment,
    #[serde(default)]
    pub ui_language: UiLanguage,
    #[serde(default)]
    pub theme: Theme,
    #[serde(default)]
    pub pair_mappings: Vec<(Language, Language)>,
    #[serde(default = "default_target_language")]
    pub global_default_target: Language,
    #[serde(default = "crate::hotkey::defaults")]
    pub hotkeys: Vec<HotkeyBinding>,
    #[serde(default = "default_naming_styles")]
    pub naming_styles: Vec<NamingStyle>,
    #[serde(default)]
    pub prompt_overrides: PromptOverrides,
}

/// 保存配置前的结构校验错误；消息不得包含密钥。
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ConfigValidationError {
    #[error("配置版本不兼容（检测到 {found}），请重新配置 AI 提供商")]
    UnsupportedSchema { found: u32 },
    #[error("提供商配置无效: {0}")]
    InvalidProvider(String),
    #[error("提供商 ID 重复: {0}")]
    DuplicateProvider(String),
    #[error("提供商 `{provider_id}` 的模型 ID 重复: {model_id}")]
    DuplicateModel {
        provider_id: String,
        model_id: String,
    },
}

fn default_target_language() -> Language {
    Language::Zh
}

fn default_naming_styles() -> Vec<NamingStyle> {
    NamingStyle::all().to_vec()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: CONFIG_SCHEMA_VERSION,
            providers: Vec::new(),
            models: ModelAssignment::default(),
            ui_language: UiLanguage::default(),
            theme: Theme::default(),
            pair_mappings: Vec::new(),
            global_default_target: default_target_language(),
            hotkeys: hotkey::defaults(),
            naming_styles: default_naming_styles(),
            prompt_overrides: PromptOverrides::default(),
        }
    }
}

impl AppConfig {
    /// 校验可持久化配置的安全边界；不读取 catalog 去覆盖任何实例字段。
    pub fn validate(&self) -> Result<(), ConfigValidationError> {
        if self.schema_version != CONFIG_SCHEMA_VERSION {
            return Err(ConfigValidationError::UnsupportedSchema {
                found: self.schema_version,
            });
        }
        let mut provider_ids = HashSet::new();
        for provider in &self.providers {
            if provider.id.trim().is_empty()
                || provider.name.trim().is_empty()
                || provider.base_url.trim().is_empty()
            {
                return Err(ConfigValidationError::InvalidProvider(
                    "ID、名称和端点不能为空".into(),
                ));
            }
            if !provider_ids.insert(provider.id.as_str()) {
                return Err(ConfigValidationError::DuplicateProvider(
                    provider.id.clone(),
                ));
            }
            if provider.auth != AuthScheme::None && provider.api_key.trim().is_empty() {
                return Err(ConfigValidationError::InvalidProvider(format!(
                    "`{}` 缺少 API Key",
                    provider.id
                )));
            }
            let auth_matches = matches!(
                (provider.protocol, provider.auth),
                (
                    Protocol::OpenAiChatCompletions,
                    AuthScheme::Bearer | AuthScheme::None
                ) | (Protocol::OpenAiResponses, AuthScheme::Bearer)
                    | (Protocol::AnthropicMessages, AuthScheme::AnthropicApiKey)
                    | (Protocol::GeminiGenerateContent, AuthScheme::GeminiApiKey)
            );
            if !auth_matches {
                return Err(ConfigValidationError::InvalidProvider(format!(
                    "`{}` 的协议与认证方式不匹配",
                    provider.id
                )));
            }
            if provider.protocol == Protocol::OpenAiResponses
                && (provider.preset_id.as_deref() != Some("openai-responses")
                    || provider.base_url != "https://api.openai.com")
            {
                return Err(ConfigValidationError::InvalidProvider(
                    "OpenAI Responses 首期仅支持 OpenAI 官方预设与官方端点".into(),
                ));
            }

            let mut model_ids = HashSet::new();
            for model in &provider.models {
                if model.id.trim().is_empty() {
                    return Err(ConfigValidationError::InvalidProvider(format!(
                        "`{}` 含空模型 ID",
                        provider.id
                    )));
                }
                if !model_ids.insert(model.id.as_str()) {
                    return Err(ConfigValidationError::DuplicateModel {
                        provider_id: provider.id.clone(),
                        model_id: model.id.clone(),
                    });
                }
                if model
                    .context_window
                    .as_ref()
                    .is_some_and(|value| value.value == 0)
                    || model
                        .max_output_tokens
                        .as_ref()
                        .is_some_and(|value| value.value == 0)
                {
                    return Err(ConfigValidationError::InvalidProvider(format!(
                        "`{}` 的模型规格必须大于 0",
                        provider.id
                    )));
                }
            }
        }
        Ok(())
    }

    /// 旧浮窗动作归并为划词翻译；重复动作以最后一条为准。
    pub fn normalize_hotkeys(&mut self) {
        use std::collections::BTreeMap;
        let mut bindings = BTreeMap::new();
        for binding in self.hotkeys.drain(..) {
            bindings.insert(binding.action, binding);
        }
        self.hotkeys = bindings.into_values().collect();
    }
    /// 按 id 查找提供商。
    #[must_use]
    pub fn provider(&self, id: &str) -> Option<&ProviderConfig> {
        self.providers.iter().find(|p| p.id == id)
    }

    /// 解析功能所用模型并校验提供商存在，返回 `(provider, model_ref)`。
    pub fn resolve_model(
        &self,
        feature: Feature,
    ) -> Result<(&ProviderConfig, &ModelRef), ResolveError> {
        let model_ref = self.models.resolve(feature)?;
        let provider = self
            .providers
            .iter()
            .find(|p| p.id == model_ref.provider_id)
            .ok_or_else(|| ResolveError::UnknownProvider {
                provider_id: model_ref.provider_id.clone(),
            })?;
        Ok((provider, model_ref))
    }

    /// 在调用边界再次校验模型存在、能力与参数。UI 过滤不是安全边界。
    pub fn resolve_request(
        &self,
        feature: Feature,
    ) -> Result<ResolvedModelRequest<'_>, ResolveError> {
        if self.schema_version != CONFIG_SCHEMA_VERSION {
            return Err(ResolveError::UnsupportedSchema {
                found: self.schema_version,
            });
        }
        let (provider, model_ref) = self.resolve_model(feature)?;
        if provider.protocol == Protocol::OpenAiResponses
            && (provider.preset_id.as_deref() != Some("openai-responses")
                || provider.base_url != "https://api.openai.com")
        {
            return Err(ResolveError::ResponsesEndpointUnsupported);
        }
        let model = provider
            .models
            .iter()
            .find(|candidate| candidate.id == model_ref.model)
            .ok_or_else(|| ResolveError::UnknownModel {
                model: model_ref.model.clone(),
            })?;
        if !model.supported_features.contains(&feature) {
            return Err(ResolveError::FeatureUnsupported {
                feature,
                model: model.id.clone(),
            });
        }
        let profile_matches = provider.parameter_profile.as_ref().is_some_and(|profile| {
            profile.protocol == provider.protocol && profile.endpoint_scope == provider.base_url
        });
        // 端点或协议改离审核范围时，保留已保存值供用户改回，但本次请求保守地不发送可选参数。
        let generation = if profile_matches {
            model_ref.generation.clone().unwrap_or_default()
        } else {
            GenerationSettings::default()
        };
        if let Some(temperature) = generation.temperature {
            if !temperature.is_finite() || !(0.0..=2.0).contains(&temperature) {
                return Err(ResolveError::ParameterInvalid {
                    parameter: "temperature".into(),
                });
            }
            if !profile_matches
                || !model.supports_temperature
                || !provider
                    .parameter_profile
                    .as_ref()
                    .is_some_and(|profile| profile.supports_temperature)
            {
                return Err(ResolveError::ParameterUnsupported {
                    parameter: "temperature".into(),
                });
            }
        }
        if let Some(max_output_tokens) = generation.max_output_tokens {
            if max_output_tokens == 0
                || model
                    .max_output_tokens
                    .as_ref()
                    .is_some_and(|limit| max_output_tokens > limit.value)
            {
                return Err(ResolveError::ParameterInvalid {
                    parameter: "max_output_tokens".into(),
                });
            }
            let field_matches_protocol = provider
                .parameter_profile
                .as_ref()
                .and_then(|profile| profile.max_output_field)
                .is_some_and(|field| match provider.protocol {
                    Protocol::OpenAiChatCompletions => matches!(
                        field,
                        MaxOutputField::MaxTokens | MaxOutputField::MaxCompletionTokens
                    ),
                    Protocol::OpenAiResponses => field == MaxOutputField::MaxOutputTokens,
                    Protocol::AnthropicMessages => field == MaxOutputField::MaxTokens,
                    Protocol::GeminiGenerateContent => {
                        field == MaxOutputField::GeminiMaxOutputTokens
                    }
                });
            if !profile_matches || !field_matches_protocol || !model.supports_max_output {
                return Err(ResolveError::ParameterUnsupported {
                    parameter: "max_output_tokens".into(),
                });
            }
        }
        if generation.reasoning_effort.is_some()
            && (!profile_matches
                || provider.protocol != Protocol::OpenAiResponses
                || !model.supports_reasoning
                || !provider
                    .parameter_profile
                    .as_ref()
                    .is_some_and(|p| p.supports_reasoning))
        {
            return Err(ResolveError::ParameterUnsupported {
                parameter: "reasoning_effort".into(),
            });
        }
        Ok(ResolvedModelRequest {
            provider,
            model,
            model_ref,
            generation,
        })
    }
}

/// 新 provider 配置 schema 版本。
pub const CONFIG_SCHEMA_VERSION: u32 = 2;

/// 已完成资格校验的调用输入。
pub struct ResolvedModelRequest<'a> {
    pub provider: &'a ProviderInstance,
    pub model: &'a ModelDescriptor,
    pub model_ref: &'a ModelRef,
    pub generation: GenerationSettings,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ipc_contract_fixture() -> serde_json::Value {
        serde_json::from_str(include_str!("../../../fixtures/ipc-contract.json"))
            .expect("IPC 契约 fixture 必须是合法 JSON")
    }

    fn sample_provider() -> ProviderConfig {
        ProviderConfig {
            id: "deepseek-1".into(),
            protocol: Protocol::OpenAiChatCompletions,
            preset_id: Some("deepseek".into()),
            name: "DeepSeek".into(),
            base_url: "https://api.deepseek.com".into(),
            api_key: "sk-abcdef1234567890".into(),
            auth: AuthScheme::Bearer,
            parameter_profile: Some(ParameterProfile {
                protocol: Protocol::OpenAiChatCompletions,
                endpoint_scope: "https://api.deepseek.com".into(),
                supports_temperature: true,
                max_output_field: Some(MaxOutputField::MaxTokens),
                supports_reasoning: false,
            }),
            models: vec![
                ModelDescriptor {
                    id: "deepseek-chat".into(),
                    origin: ModelOrigin::BundledVerified,
                    source_url: Some("https://api-docs.deepseek.com/".into()),
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
                    supports_temperature: true,
                    supports_max_output: true,
                    supports_reasoning: false,
                },
                ModelDescriptor {
                    id: "deepseek-reasoner".into(),
                    origin: ModelOrigin::BundledVerified,
                    source_url: Some("https://api-docs.deepseek.com/".into()),
                    verified_at: Some("2026-09-17".into()),
                    display_name: None,
                    supported_features: vec![Feature::Translate],
                    context_window: None,
                    max_output_tokens: None,
                    supports_temperature: false,
                    supports_max_output: true,
                    supports_reasoning: true,
                },
            ],
        }
    }

    #[test]
    fn provider_debug_redacts_api_key() {
        let p = sample_provider();
        let dbg = format!("{p:?}");
        assert!(!dbg.contains("sk-abcdef1234567890"));
        assert!(dbg.contains("<redacted>"));
    }

    #[test]
    fn default_config_matches_shared_ipc_contract_fixture() {
        let fixture = ipc_contract_fixture();
        let expected = fixture
            .get("default_config")
            .expect("fixture 必须包含 default_config");
        assert_eq!(
            serde_json::to_value(AppConfig::default()).unwrap(),
            *expected
        );
    }

    #[test]
    fn legacy_config_fixture_keeps_alias_and_default_migration_behavior() {
        let fixture = ipc_contract_fixture();
        let mut config: AppConfig = serde_json::from_value(
            fixture
                .get("legacy_config")
                .expect("fixture 必须包含 legacy_config")
                .clone(),
        )
        .unwrap();
        config.normalize_hotkeys();
        assert_eq!(config.ui_language, UiLanguage::En);
        assert_eq!(config.global_default_target, Language::Zh);
        assert_eq!(config.hotkeys.len(), 1);
        assert_eq!(config.hotkeys[0].combo.key, "K");
    }

    #[test]
    fn mask_secret_short_and_long() {
        // ≤ 8：全掩码。
        assert_eq!(mask_secret("abc"), "********");
        assert_eq!(mask_secret(""), "********");
        // > 8：首 2 + (n-4) 星 + 末 2。"abcdefghij" 共 10 字符 → 6 星。
        assert_eq!(mask_secret("abcdefghij"), "ab******ij");
    }

    #[test]
    fn redact_keeps_preview_and_models() {
        let p = sample_provider();
        let r = p.redact();
        assert_eq!(r.id, "deepseek-1");
        // 首尾保留、中段掩码，不依赖精确星数。
        assert!(r.api_key_preview.starts_with("sk"));
        assert!(r.api_key_preview.ends_with("90"));
        assert!(!r.api_key_preview.contains("abcdef"));
        assert_eq!(r.models.len(), 2);
    }

    #[test]
    fn resolve_uses_feature_default_first() {
        let m = ModelAssignment {
            translate: Some(ModelRef {
                provider_id: "a".into(),
                model: "t-model".into(),
                generation: None,
            }),
            global_default: Some(ModelRef {
                provider_id: "b".into(),
                model: "g-model".into(),
                generation: None,
            }),
            ..Default::default()
        };
        let r = m.resolve(Feature::Translate).unwrap();
        assert_eq!(r.model, "t-model");
    }

    #[test]
    fn resolve_falls_back_to_global_default() {
        let m = ModelAssignment {
            global_default: Some(ModelRef {
                provider_id: "b".into(),
                model: "g-model".into(),
                generation: None,
            }),
            ..Default::default()
        };
        let r = m.resolve(Feature::Naming).unwrap();
        assert_eq!(r.model, "g-model");
    }

    #[test]
    fn document_translation_resolve_falls_back_to_global_default() {
        let m = ModelAssignment {
            global_default: Some(ModelRef {
                provider_id: "b".into(),
                model: "g-model".into(),
                generation: None,
            }),
            ..Default::default()
        };
        let r = m.resolve(Feature::DocTranslate).unwrap();
        assert_eq!(r.model, "g-model");
    }

    #[test]
    fn resolve_unassigned_without_any_default() {
        let m = ModelAssignment::default();
        let err = m.resolve(Feature::Explain).unwrap_err();
        assert_eq!(
            err,
            ResolveError::Unassigned {
                feature: Feature::Explain
            }
        );
    }

    #[test]
    fn resolve_model_validates_provider_existence() {
        let mut cfg = AppConfig::default();
        cfg.providers.push(sample_provider());
        cfg.models.translate = Some(ModelRef {
            provider_id: "deepseek-1".into(),
            model: "deepseek-chat".into(),
            generation: None,
        });
        let (provider, model_ref) = cfg.resolve_model(Feature::Translate).unwrap();
        assert_eq!(provider.id, "deepseek-1");
        assert_eq!(model_ref.model, "deepseek-chat");

        // 引用不存在的 provider。
        cfg.models.naming = Some(ModelRef {
            provider_id: "ghost".into(),
            model: "x".into(),
            generation: None,
        });
        let err = cfg.resolve_model(Feature::Naming).unwrap_err();
        assert!(matches!(err, ResolveError::UnknownProvider { .. }));
    }

    #[test]
    fn default_config_has_sensible_values() {
        let cfg = AppConfig::default();
        assert!(cfg.providers.is_empty());
        assert_eq!(cfg.ui_language, UiLanguage::System);
        assert_eq!(cfg.global_default_target, Language::Zh);
        assert_eq!(cfg.hotkeys.len(), 2);
        assert_eq!(cfg.naming_styles.len(), 5);
        assert_eq!(cfg.theme, Theme::System);
    }

    #[test]
    fn system_ui_language_uses_the_frontend_resolved_locale_for_translation() {
        assert_eq!(
            UiLanguage::System.translation_language(Some(Language::Zh)),
            Language::Zh
        );
        assert_eq!(UiLanguage::System.translation_language(None), Language::En);
        assert_eq!(
            UiLanguage::En.translation_language(Some(Language::Zh)),
            Language::En
        );
    }

    #[test]
    fn config_roundtrips_through_json() {
        let mut cfg = AppConfig::default();
        cfg.providers.push(sample_provider());
        cfg.models.global_default = Some(ModelRef {
            provider_id: "deepseek-1".into(),
            model: "deepseek-chat".into(),
            generation: None,
        });
        let json = serde_json::to_string(&cfg).unwrap();
        let back: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.providers.len(), 1);
        // 配置文件保存真实 Key（权限 0600 保护），序列化保留明文。
        assert_eq!(back.providers[0].api_key, "sk-abcdef1234567890");
        assert_eq!(
            back.models.global_default.as_ref().unwrap().model,
            "deepseek-chat"
        );
    }

    #[test]
    fn old_schema_is_not_silently_interpreted_as_new_config() {
        // Issue 24 明确不做旧 ProviderConfig 自动迁移。
        assert!(serde_json::from_str::<AppConfig>("{}").is_err());
    }

    #[test]
    fn validate_rejects_missing_key_and_allows_no_auth_provider() {
        let mut config = AppConfig::default();
        let mut provider = sample_provider();
        provider.api_key.clear();
        config.providers.push(provider);
        assert!(matches!(
            config.validate(),
            Err(ConfigValidationError::InvalidProvider(_))
        ));

        config.providers[0].auth = AuthScheme::None;
        assert!(config.validate().is_ok());
    }

    #[test]
    fn responses_requires_official_preset_and_endpoint() {
        let mut config = AppConfig::default();
        let mut provider = sample_provider();
        provider.protocol = Protocol::OpenAiResponses;
        provider.preset_id = Some("openai-responses".into());
        provider.base_url = "https://proxy.example".into();
        config.providers.push(provider);
        assert!(matches!(
            config.validate(),
            Err(ConfigValidationError::InvalidProvider(_))
        ));
    }

    #[test]
    fn resolve_request_validates_parameter_range_and_profile_mapping() {
        let mut config = AppConfig::default();
        let mut provider = sample_provider();
        provider.models[0].max_output_tokens = Some(SourcedValue {
            value: 1_024,
            source: ValueSource::BundledVerified,
            source_url: Some("https://example.test/spec".into()),
            verified_at: Some("2026-09-17".into()),
        });
        config.providers.push(provider);
        config.models.translate = Some(ModelRef {
            provider_id: "deepseek-1".into(),
            model: "deepseek-chat".into(),
            generation: Some(GenerationSettings {
                temperature: Some(0.5),
                max_output_tokens: Some(512),
                reasoning_effort: None,
            }),
        });
        assert!(config.resolve_request(Feature::Translate).is_ok());

        config.models.translate.as_mut().unwrap().generation = Some(GenerationSettings {
            temperature: Some(2.5),
            max_output_tokens: None,
            reasoning_effort: None,
        });
        assert!(matches!(
            config.resolve_request(Feature::Translate),
            Err(ResolveError::ParameterInvalid { .. })
        ));

        config.models.translate.as_mut().unwrap().generation = Some(GenerationSettings {
            temperature: None,
            max_output_tokens: Some(2_048),
            reasoning_effort: None,
        });
        assert!(matches!(
            config.resolve_request(Feature::Translate),
            Err(ResolveError::ParameterInvalid { .. })
        ));

        config.models.translate.as_mut().unwrap().generation = Some(GenerationSettings {
            temperature: None,
            max_output_tokens: Some(512),
            reasoning_effort: None,
        });
        config.providers[0]
            .parameter_profile
            .as_mut()
            .unwrap()
            .max_output_field = Some(MaxOutputField::MaxOutputTokens);
        assert!(matches!(
            config.resolve_request(Feature::Translate),
            Err(ResolveError::ParameterUnsupported { .. })
        ));

        config.providers[0].base_url = "https://custom.example".into();
        let resolved = config.resolve_request(Feature::Translate).unwrap();
        assert_eq!(resolved.generation, GenerationSettings::default());
    }
}

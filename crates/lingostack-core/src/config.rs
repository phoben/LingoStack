//! 应用配置模型与模型解析（设计文档 §6 / §8）。
//!
//! 配置由 Rust 侧读写、序列化为 JSON（文件权限 `0600`，见 `lingostack-app`）。
//! API Key 必须写入文件（运行需要），但任何调试输出都会脱敏——由
//! [`ProviderConfig`] 自定义的 `Debug` 实现保证，配合 [`ProviderConfig::redact`]
//! 给出可展示的首尾预览。

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::hotkey::{self, HotkeyBinding};
use crate::lang::Language;
use crate::naming::NamingStyle;
use crate::prompt::PromptOverrides;

/// LLM 提供商协议类型，决定请求体格式与响应流的解析方式。
#[derive(Default, Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    /// OpenAI 兼容协议（覆盖 OpenAI / DeepSeek / 通义千问 / 智谱 / 本地 Ollama 等）。
    #[default]
    OpenAiCompatible,
    /// Anthropic 原生协议。
    Anthropic,
    /// Google Gemini 原生协议。
    Gemini,
    /// Ollama 本地（OpenAI 兼容子类，UI 单列以便预填 `http://localhost:11434`）。
    Ollama,
}

/// 一个 LLM 提供商实例。用户可配多个同协议实例（如两个 DeepSeek 账号）。
///
/// `Debug` 实现自动把 `api_key` 显示为 `"<redacted>"`，杜绝 Key 泄漏进
/// 日志 / 错误 / 崩溃报告。
#[derive(Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// 用户定义的唯一 id（如 `"deepseek-1"`），模型引用据此关联。
    pub id: String,
    /// 协议类型。
    pub kind: ProviderKind,
    /// 显示名（如 `"DeepSeek"`）。
    pub name: String,
    /// API 基地址（如 `https://api.deepseek.com`）。
    pub base_url: String,
    /// API Key（敏感）。调试输出自动脱敏；需展示首尾预览用 [`redact`](Self::redact)。
    pub api_key: String,
    /// 可用模型列表（如 `["deepseek-chat", "deepseek-reasoner"]`）。
    pub models: Vec<String>,
}

impl fmt::Debug for ProviderConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProviderConfig")
            .field("id", &self.id)
            .field("kind", &self.kind)
            .field("name", &self.name)
            .field("base_url", &self.base_url)
            .field("api_key", &"<redacted>")
            .field("models", &self.models)
            .finish()
    }
}

impl ProviderConfig {
    /// 返回脱敏视图（含 Key 首尾预览），用于 UI「已配置」提示或详细日志。
    #[must_use]
    pub fn redact(&self) -> RedactedProvider<'_> {
        RedactedProvider {
            id: &self.id,
            kind: self.kind,
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
    pub kind: ProviderKind,
    pub name: &'a str,
    pub base_url: &'a str,
    pub api_key_preview: String,
    pub models: &'a [String],
}

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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelRef {
    pub provider_id: String,
    pub model: String,
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
    /// 功能既无默认模型也无全局兜底。
    #[error("功能 {feature:?} 未配置默认模型，亦无全局兜底")]
    Unassigned { feature: Feature },
    /// 模型引用的 `provider_id` 不存在（配置不一致）。
    #[error("模型引用的提供商 `{provider_id}` 不存在")]
    UnknownProvider { provider_id: String },
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

/// 应用配置根。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub providers: Vec<ProviderConfig>,
    #[serde(default)]
    pub models: ModelAssignment,
    #[serde(default = "default_ui_language")]
    pub ui_language: Language,
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

fn default_ui_language() -> Language {
    Language::Zh
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
            providers: Vec::new(),
            models: ModelAssignment::default(),
            ui_language: default_ui_language(),
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
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_provider() -> ProviderConfig {
        ProviderConfig {
            id: "deepseek-1".into(),
            kind: ProviderKind::OpenAiCompatible,
            name: "DeepSeek".into(),
            base_url: "https://api.deepseek.com".into(),
            api_key: "sk-abcdef1234567890".into(),
            models: vec!["deepseek-chat".into(), "deepseek-reasoner".into()],
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
            }),
            global_default: Some(ModelRef {
                provider_id: "b".into(),
                model: "g-model".into(),
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
            }),
            ..Default::default()
        };
        let r = m.resolve(Feature::Naming).unwrap();
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
        });
        let (provider, model_ref) = cfg.resolve_model(Feature::Translate).unwrap();
        assert_eq!(provider.id, "deepseek-1");
        assert_eq!(model_ref.model, "deepseek-chat");

        // 引用不存在的 provider。
        cfg.models.naming = Some(ModelRef {
            provider_id: "ghost".into(),
            model: "x".into(),
        });
        let err = cfg.resolve_model(Feature::Naming).unwrap_err();
        assert!(matches!(err, ResolveError::UnknownProvider { .. }));
    }

    #[test]
    fn default_config_has_sensible_values() {
        let cfg = AppConfig::default();
        assert!(cfg.providers.is_empty());
        assert_eq!(cfg.ui_language, Language::Zh);
        assert_eq!(cfg.global_default_target, Language::Zh);
        assert_eq!(cfg.hotkeys.len(), 3);
        assert_eq!(cfg.naming_styles.len(), 5);
        assert_eq!(cfg.theme, Theme::System);
    }

    #[test]
    fn config_roundtrips_through_json() {
        let mut cfg = AppConfig::default();
        cfg.providers.push(sample_provider());
        cfg.models.global_default = Some(ModelRef {
            provider_id: "deepseek-1".into(),
            model: "deepseek-chat".into(),
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
    fn missing_fields_fill_defaults_on_deserialize() {
        // 空对象 → 全部字段走默认值（向前兼容旧 / 残缺配置）。
        let cfg: AppConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(cfg.ui_language, Language::Zh);
        assert_eq!(cfg.hotkeys.len(), 3);
        assert_eq!(cfg.naming_styles.len(), 5);
        assert!(cfg.providers.is_empty());
    }
}

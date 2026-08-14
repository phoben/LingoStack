//! 语言枚举、粗粒度探测与目标语言解析（设计文档 §5）。

use serde::{Deserialize, Serialize};

/// 应用支持的语言。
///
/// V1 先覆盖中 / 英 / 日——界面语言（中 / 英）与常见翻译目标。
/// 扩展只需追加变体，`lowercase` 序列化保持向前兼容。
#[derive(
    Default, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Zh,
    #[default]
    En,
    Ja,
}

/// 翻译入口使用的已解析语言对。前端只消费结果，不复制探测/映射规则。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TranslationPlan {
    pub source: Language,
    pub target: Language,
}

impl TranslationPlan {
    /// 从文本、配置规则与本次显式选择得到最终语言对。
    #[must_use]
    pub fn resolve(
        text: &str,
        source_override: Option<Language>,
        target_override: Option<Language>,
        pair_mapping: &[(Language, Language)],
        ui_language: Language,
        global_default: Language,
    ) -> Self {
        let source = source_override.unwrap_or_else(|| Language::detect(text));
        let target = target_override.unwrap_or_else(|| {
            resolve_target_language(source, pair_mapping, ui_language, global_default)
        });
        Self { source, target }
    }
}

impl Language {
    /// ISO 短码，用于持久化与 UI 字幕。
    #[must_use]
    pub fn code(self) -> &'static str {
        match self {
            Self::Zh => "zh",
            Self::En => "en",
            Self::Ja => "ja",
        }
    }

    /// 以语言自身书写显示名。
    #[must_use]
    pub fn display_name(self) -> &'static str {
        match self {
            Self::Zh => "中文",
            Self::En => "English",
            Self::Ja => "日本語",
        }
    }

    /// 由短码反查；未知返回 `None`。
    #[must_use]
    pub fn from_code(code: &str) -> Option<Self> {
        match code {
            "zh" => Some(Self::Zh),
            "en" => Some(Self::En),
            "ja" => Some(Self::Ja),
            _ => None,
        }
    }

    /// 粗粒度启发式探测：含日文假名 → 日；含 CJK 表意 → 中；否则英。
    ///
    /// 仅用于「自动检测」源语言的最佳估计，非精确分词。空串归为英文。
    #[must_use]
    pub fn detect(text: &str) -> Self {
        let mut has_kana = false;
        let mut has_ideograph = false;
        for ch in text.chars() {
            if ('\u{3040}'..='\u{30FF}').contains(&ch) {
                has_kana = true;
            } else if ('\u{4E00}'..='\u{9FFF}').contains(&ch) {
                has_ideograph = true;
            }
        }
        if has_kana {
            Self::Ja
        } else if has_ideograph {
            Self::Zh
        } else {
            Self::En
        }
    }
}

/// 按设计文档 §5 四条优先级解析目标语言：
///
/// 1. 命中语言对映射 → 映射目标；
/// 2. 未命中映射、原文与界面不同语种 → 界面语言；
/// 3. 原文与界面同语种（非英文）→ 英文；
/// 4. 原文与界面同为英文 → 全局默认目标语言。
#[must_use]
pub fn resolve_target_language(
    source: Language,
    pair_mapping: &[(Language, Language)],
    ui_language: Language,
    global_default: Language,
) -> Language {
    // 规则 1：语言对映射命中。
    if let Some((_, to)) = pair_mapping.iter().find(|(from, _)| *from == source) {
        return *to;
    }
    // 规则 2：原文与界面不同语种 → 界面语言。
    if source != ui_language {
        return ui_language;
    }
    // 规则 3：同语种且非英文 → 英文（避免同语种「翻译」）。
    if ui_language != Language::En {
        return Language::En;
    }
    // 规则 4：界面与原文同为英文 → 全局默认。
    global_default
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_roundtrips() {
        for &lang in &[Language::Zh, Language::En, Language::Ja] {
            assert_eq!(Language::from_code(lang.code()), Some(lang));
        }
        assert_eq!(Language::from_code("fr"), None);
    }

    #[test]
    fn default_is_english() {
        assert_eq!(Language::default(), Language::En);
    }

    #[test]
    fn serializes_lowercase_code() {
        let json = serde_json::to_string(&Language::Ja).unwrap();
        assert_eq!(json, "\"ja\"");
        let back: Language = serde_json::from_str("\"zh\"").unwrap();
        assert_eq!(back, Language::Zh);
    }

    #[test]
    fn detect_categorizes() {
        assert_eq!(Language::detect("hello world"), Language::En);
        assert_eq!(Language::detect("你好，世界"), Language::Zh);
        assert_eq!(Language::detect("こんにちは"), Language::Ja);
        // 假名优先于汉字：日文通常含假名。
        assert_eq!(Language::detect("プログラムの設計"), Language::Ja);
        assert_eq!(Language::detect(""), Language::En);
    }

    #[test]
    fn resolve_uses_pair_mapping_first() {
        let target = resolve_target_language(
            Language::Zh,
            &[(Language::Zh, Language::Ja)],
            Language::Zh,
            Language::En,
        );
        assert_eq!(target, Language::Ja);
    }

    #[test]
    fn resolve_uses_ui_language_when_source_differs() {
        let target = resolve_target_language(Language::En, &[], Language::Zh, Language::Ja);
        assert_eq!(target, Language::Zh);
    }

    #[test]
    fn resolve_same_non_english_source_targets_english() {
        let target = resolve_target_language(Language::Zh, &[], Language::Zh, Language::En);
        assert_eq!(target, Language::En);
    }

    #[test]
    fn resolve_english_to_english_uses_global_default() {
        let target = resolve_target_language(Language::En, &[], Language::En, Language::Zh);
        assert_eq!(target, Language::Zh);
    }

    #[test]
    fn plan_honors_explicit_choices_before_configuration_rules() {
        let plan = TranslationPlan::resolve(
            "hello",
            Some(Language::Ja),
            Some(Language::Zh),
            &[(Language::Ja, Language::En)],
            Language::En,
            Language::Ja,
        );
        assert_eq!(plan.source, Language::Ja);
        assert_eq!(plan.target, Language::Zh);
    }
}

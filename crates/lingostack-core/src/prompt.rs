//! 内置 Prompt 模板（设计文档 §6.2「开发行业语言」规范）。
//!
//! 所有 AI 功能（翻译 / 命名 / 解释）支持用户自定义 Prompt；任一字段留空
//! （`None`）即回退到此处的内置版本。内置 Prompt 遵循：
//! - 避让产品名、变量名、命令名、技术名词（避免直译，如 Redis 不译为「远程字典服务」）；
//! - 译文符合目标语言开发者社区的自然表达。
//!
//! # Prompt 快照机制（设计文档 §10.1）
//!
//! Prompt 正文存放在 `src/prompts/*.txt`，经 `include_str!` 编入常量。这样：
//! - 文本单一来源，无需在 Rust 字面量里处理转义与拼接；
//! - **每次改动都会在 `git diff` 中逐行显示**——独立文本文件本身即快照，
//!   无需引入快照测试框架与 `.snap` 管理；
//! - 下方测试断言关键风格约束（保留原文 / 禁止意译 / 占位符完整），
//!   守住「开发行业语言」规范不被无意改坏。
//!
//! 修改 Prompt 时请在 PR 中说明动机——风格回归很难在事后察觉。

use crate::lang::Language;
use serde::{Deserialize, Serialize};

/// 翻译内置 Prompt。`{source_lang}` / `{target_lang}` 由功能层替换。
pub const TRANSLATE_PROMPT: &str = include_str!("prompts/translate.txt");

/// 变量名生成内置 Prompt。`{style}` 由功能层替换为 [`crate::naming::NamingStyle`] 的展示名。
pub const NAMING_PROMPT: &str = include_str!("prompts/naming.txt");

/// 词条解释内置 Prompt。`{target_lang}` 由功能层替换。
pub const EXPLAIN_PROMPT: &str = include_str!("prompts/explain.txt");

/// 翻译结果中术语元数据的保留行。该文本永远不能显示给最终用户。
pub const TRANSLATION_TERMS_SENTINEL: &str = "<<<LINGOSTACK_TERMS_V1>>>";

/// 把用户可选的翻译风格与不可覆盖的机器协议组合。
#[must_use]
pub fn compose_translation_prompt(base: &str, source: Language) -> String {
    format!(
        "{base}\n\n输出协议（不可替换）：先仅输出译文正文；随后单独一行输出 {sentinel}；紧接着输出 JSON 数组。JSON 每项只能为 {{\"term\":\"…\",\"category\":\"technology|programming|product\",\"explanation\":\"…\"}}。仅提取上下文相关的专业 IT 概念、编程/技术栈术语或产品名，普通词一律省略；最多 5 项，无法确定时输出 []。term 必须出现在原文或译文中，去重。explanation 必须用 {source} 简洁说明。不要输出 Markdown、代码围栏或任何其他元数据。",
        sentinel = TRANSLATION_TERMS_SENTINEL,
        source = source.display_name(),
    )
}

/// 用户自定义 Prompt 覆盖；任一字段留空（`None`）即回退到内置。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PromptOverrides {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub translate: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub naming: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explain: Option<String>,
}

impl PromptOverrides {
    /// 翻译 Prompt：自定义优先，否则内置。
    #[must_use]
    pub fn translate(&self) -> &str {
        self.translate.as_deref().unwrap_or(TRANSLATE_PROMPT)
    }

    /// 命名 Prompt：自定义优先，否则内置。
    #[must_use]
    pub fn naming(&self) -> &str {
        self.naming.as_deref().unwrap_or(NAMING_PROMPT)
    }

    /// 解释 Prompt：自定义优先，否则内置。
    #[must_use]
    pub fn explain(&self) -> &str {
        self.explain.as_deref().unwrap_or(EXPLAIN_PROMPT)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_overrides_fall_back_to_builtins() {
        let o = PromptOverrides::default();
        assert_eq!(o.translate(), TRANSLATE_PROMPT);
        assert_eq!(o.naming(), NAMING_PROMPT);
        assert_eq!(o.explain(), EXPLAIN_PROMPT);
    }

    #[test]
    fn custom_override_wins() {
        let o = PromptOverrides {
            translate: Some("我的翻译指令".into()),
            ..Default::default()
        };
        assert_eq!(o.translate(), "我的翻译指令");
        // 未覆盖的字段仍走内置。
        assert_eq!(o.naming(), NAMING_PROMPT);
    }

    #[test]
    fn overrides_skip_none_when_serialized() {
        let o = PromptOverrides::default();
        let json = serde_json::to_string(&o).unwrap();
        assert_eq!(json, "{}");
    }

    #[test]
    fn translate_prompt_encodes_dev_language_rules() {
        // 关键约束须被编码进内置 Prompt，防止回归为直译风格。
        assert!(
            TRANSLATE_PROMPT.contains("原样保留") || TRANSLATE_PROMPT.contains("保留原文"),
            "翻译 Prompt 必须明示技术术语保留原文"
        );
        assert!(TRANSLATE_PROMPT.contains("禁止意译"));
        assert!(TRANSLATE_PROMPT.contains("Redis"));
        assert!(TRANSLATE_PROMPT.contains("{target_lang}"));
    }

    /// 命名 Prompt 须产出「中性词组」而非某一种写法。
    ///
    /// 命名功能一次请求取回若干小写空格分隔的英文词组，五种写法在前端本地铺开
    /// （见 `src/lib/case-convert.ts`），从而一次生成只花一次模型调用，且五列
    /// 逐行对齐同一个词。故此 Prompt **不再**含 `{style}` 占位符——若有人把
    /// 「按某规范输出」加回来，前端的写法转换会拿到已带修饰的输入。
    #[test]
    fn naming_prompt_requires_neutral_word_groups() {
        assert!(
            !NAMING_PROMPT.contains("{style}"),
            "命名 Prompt 不应再含 {{style}} 占位符——写法转换已移到前端"
        );
        assert!(
            NAMING_PROMPT.contains("小写"),
            "命名 Prompt 必须要求全小写，否则前端拆词会收到带写法修饰的输入"
        );
        assert!(
            NAMING_PROMPT.contains("空格"),
            "命名 Prompt 必须明示单词以空格分隔"
        );
        assert!(
            NAMING_PROMPT.contains("5 个候选"),
            "命名 Prompt 必须要求 5 个候选（界面每列固定五行）"
        );
        // 三类写法修饰都要显式排除，避免模型自行套用某种规范。
        for forbidden in ["下划线", "连字符", "驼峰"] {
            assert!(
                NAMING_PROMPT.contains(forbidden),
                "命名 Prompt 必须显式排除「{forbidden}」修饰"
            );
        }
    }

    #[test]
    fn explain_prompt_targets_reader_language() {
        assert!(EXPLAIN_PROMPT.contains("{target_lang}"));
        // 解释须面向程序员而非百科式罗列。
        assert!(EXPLAIN_PROMPT.contains("程序员"));
    }

    /// 结构完整性：防止 include_str! 指向空文件 / 文本被误截断。
    #[test]
    fn all_prompts_are_structurally_sound() {
        for (name, prompt) in [
            ("translate", TRANSLATE_PROMPT),
            ("naming", NAMING_PROMPT),
            ("explain", EXPLAIN_PROMPT),
        ] {
            assert!(prompt.len() > 80, "{name} Prompt 过短，疑似被截断");
            assert!(
                prompt.lines().count() >= 5,
                "{name} Prompt 行数过少，疑似规则丢失"
            );
            assert!(
                prompt.ends_with('\n'),
                "{name} Prompt 应以换行结尾（文本文件惯例）"
            );
            // 不应把开发期占位标记发给模型。
            assert!(
                !prompt.contains("TODO") && !prompt.contains("FIXME"),
                "{name} Prompt 残留待办标记"
            );
        }
    }

    /// 占位符必须成对齐全——缺失会让模型收到字面量 `{target_lang}`。
    #[test]
    fn translate_prompt_declares_both_language_placeholders() {
        assert!(TRANSLATE_PROMPT.contains("{source_lang}"));
        assert!(TRANSLATE_PROMPT.contains("{target_lang}"));
    }

    #[test]
    fn translation_protocol_is_appended_even_for_conflicting_custom_prompt() {
        let prompt = compose_translation_prompt("只输出 XML", Language::En);
        assert!(prompt.starts_with("只输出 XML"));
        assert!(prompt.contains(TRANSLATION_TERMS_SENTINEL));
        assert!(prompt.contains("technology|programming|product"));
        assert!(prompt.contains("English"));
    }
}

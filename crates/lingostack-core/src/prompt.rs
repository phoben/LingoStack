//! 内置 Prompt 模板（设计文档 §6.2「开发行业语言」规范）。
//!
//! 所有 AI 功能（翻译 / 命名 / 解释）支持用户自定义 Prompt；任一字段留空
//! （`None`）即回退到此处的内置版本。内置 Prompt 遵循：
//! - 避让产品名、变量名、命令名、技术名词（避免直译，如 Redis 不译为「远程字典服务」）；
//! - 译文符合目标语言开发者社区的自然表达。
//!
//! 修改常量须配合快照测试（阶段 E 落地），防止风格回归。

use serde::{Deserialize, Serialize};

/// 翻译内置 Prompt。`{source_lang}` / `{target_lang}` 由功能层替换。
pub const TRANSLATE_PROMPT: &str = concat!(
    "你是一名熟悉软件工程的双语技术翻译。请将用户给出的文本由 {source_lang} 翻译为 {target_lang}。\n\n",
    "严格规则：\n",
    "- 技术名词、产品名、库 / 框架名、协议名、命令、标识符一律保留原文，禁止意译",
    "（示例：Redis 不译作「远程字典服务」；Docker 不译作「集装箱」；git rebase 不翻译）。\n",
    "- 代码、命令行、文件路径、URL 原样保留，只翻译其周边自然语言。\n",
    "- 译文需符合 {target_lang} 开发者社区的日常表达，避免机翻腔与逐词直译。\n",
    "- 仅输出译文本身：不要解释、不要加引号、不要写「翻译：」之类前缀。\n",
    "- 若文本为纯代码 / 纯标识符，或已是 {target_lang}，原样返回。\n",
);

/// 变量名生成内置 Prompt。`{style}` 由功能层替换为 [`crate::naming::NamingStyle`] 的展示名。
pub const NAMING_PROMPT: &str = concat!(
    "你是一名资深软件工程师，请根据用户给出的语义，生成符合 {style} 命名规范的程序标识符候选。\n\n",
    "规则：\n",
    "- 给出 3–5 个高质量候选，每行一个，仅标识符本身。\n",
    "- 不输出编号、解释、反引号或 Markdown 格式。\n",
    "- 候选须地道、简洁、词义准确，符合该命名规范的通用惯例。\n",
    "- 使用英文词汇；遇多义词取「作为程序命名」最通用的解读。\n",
);

/// 词条解释内置 Prompt。`{target_lang}` 由功能层替换。
pub const EXPLAIN_PROMPT: &str = concat!(
    "你是一名耐心的技术导师，请用 {target_lang} 向程序员读者解释用户给出的术语或概念。\n\n",
    "结构：\n",
    "- 首句给出一句话定义。\n",
    "- 随后 2–4 句补充：典型用途、常见场景、易混淆点或常见误用。\n",
    "- 涉及代码或标识符时用行内代码标注。\n",
    "- 术语首次出现给出 {target_lang} 译法并括注原文（如「优雅停机（graceful shutdown）」）。\n",
    "- 聚焦开发者真正需要知道的内容，不堆砌百科式细节。\n",
);

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

    #[test]
    fn naming_prompt_references_style_placeholder() {
        assert!(NAMING_PROMPT.contains("{style}"));
    }
}

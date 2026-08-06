//! 变量名命名规范枚举（用户决策：V1 全支持五种）。

use serde::{Deserialize, Serialize};

/// 程序标识符命名风格。LLM 命名候选须遵循用户所选风格。
#[derive(
    Default, Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
)]
#[serde(rename_all = "snake_case")]
pub enum NamingStyle {
    #[default]
    CamelCase,
    SnakeCase,
    PascalCase,
    KebabCase,
    ConstantCase,
}

impl NamingStyle {
    /// 全部可选风格，设置页与命名视图的选项来源。
    #[must_use]
    pub const fn all() -> &'static [Self] {
        &[
            Self::CamelCase,
            Self::SnakeCase,
            Self::PascalCase,
            Self::KebabCase,
            Self::ConstantCase,
        ]
    }

    /// 示例化展示名（即该风格自身的写法）。
    #[must_use]
    pub fn display_name(self) -> &'static str {
        match self {
            Self::CamelCase => "camelCase",
            Self::SnakeCase => "snake_case",
            Self::PascalCase => "PascalCase",
            Self::KebabCase => "kebab-case",
            Self::ConstantCase => "CONSTANT_CASE",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_camel_case() {
        assert_eq!(NamingStyle::default(), NamingStyle::CamelCase);
    }

    #[test]
    fn all_contains_five_styles() {
        assert_eq!(NamingStyle::all().len(), 5);
    }

    #[test]
    fn display_names_match_conventions() {
        assert_eq!(NamingStyle::CamelCase.display_name(), "camelCase");
        assert_eq!(NamingStyle::SnakeCase.display_name(), "snake_case");
        assert_eq!(NamingStyle::PascalCase.display_name(), "PascalCase");
        assert_eq!(NamingStyle::KebabCase.display_name(), "kebab-case");
        assert_eq!(NamingStyle::ConstantCase.display_name(), "CONSTANT_CASE");
    }

    #[test]
    fn serializes_snake_case() {
        let json = serde_json::to_string(&NamingStyle::PascalCase).unwrap();
        assert_eq!(json, "\"pascal_case\"");
        let back: NamingStyle = serde_json::from_str("\"kebab_case\"").unwrap();
        assert_eq!(back, NamingStyle::KebabCase);
    }
}

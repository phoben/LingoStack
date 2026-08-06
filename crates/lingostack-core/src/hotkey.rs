//! 全局热键模型与冲突检测（设计文档 §7.2）。

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::ops::BitOr;

/// 修饰键位标记（手写 bitfield，避免引入 bitflags 依赖）。
///
/// 合法位：[`Modifiers::CTRL`] / [`Modifiers::ALT`] / [`Modifiers::SHIFT`] /
/// [`Modifiers::SUPER`]。序列化为 `u8` 数字，配置文件可读性优先级低、稳定优先。
#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
)]
pub struct Modifiers(pub u8);

impl Modifiers {
    pub const NONE: Self = Self(0);
    pub const CTRL: Self = Self(1 << 0);
    pub const ALT: Self = Self(1 << 1);
    pub const SHIFT: Self = Self(1 << 2);
    pub const SUPER: Self = Self(1 << 3);

    /// 是否包含给定修饰位。
    #[must_use]
    pub fn contains(self, other: Self) -> bool {
        (self.0 & other.0) == other.0
    }
}

impl BitOr for Modifiers {
    type Output = Self;
    fn bitor(self, rhs: Self) -> Self {
        Self(self.0 | rhs.0)
    }
}

/// 一个完整的快捷键组合：修饰位 + 主键名。
///
/// `key` 为单字符（如 `"T"`）或命名键（如 `"Space"`、`"F1"`）。
/// 大小写归一化留给平台注册层。
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct KeyCombo {
    pub mods: Modifiers,
    pub key: String,
}

impl KeyCombo {
    #[must_use]
    pub fn new(mods: Modifiers, key: &str) -> Self {
        Self {
            mods,
            key: key.to_string(),
        }
    }
}

/// 可绑定全局热键的动作。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyAction {
    /// 划词后翻译选中（弹翻译浮窗）。
    TranslateSelection,
    /// 显示 / 隐藏主窗口。
    ShowMainWindow,
    /// 唤起翻译浮窗（翻译剪贴板或最近选中）。
    TranslatePopup,
}

/// 一条热键绑定。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HotkeyBinding {
    pub action: HotkeyAction,
    pub combo: KeyCombo,
}

/// 热键冲突：两个以上不同动作占用同一组合。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HotkeyConflict {
    pub combo: KeyCombo,
    pub actions: Vec<HotkeyAction>,
}

/// 返回 Windows 默认热键绑定（用户确认）：
/// - 翻译浮窗：`Ctrl+Shift+T`
/// - 主窗口：`Alt+Space`
/// - 划词翻译：`Ctrl+Shift+D`
///
/// macOS / Linux 默认值留待目标平台验证时调整（通常以 Super 替换 Ctrl）。
#[must_use]
pub fn defaults() -> Vec<HotkeyBinding> {
    vec![
        HotkeyBinding {
            action: HotkeyAction::TranslatePopup,
            combo: KeyCombo::new(Modifiers::CTRL | Modifiers::SHIFT, "T"),
        },
        HotkeyBinding {
            action: HotkeyAction::ShowMainWindow,
            combo: KeyCombo::new(Modifiers::ALT, "Space"),
        },
        HotkeyBinding {
            action: HotkeyAction::TranslateSelection,
            combo: KeyCombo::new(Modifiers::CTRL | Modifiers::SHIFT, "D"),
        },
    ]
}

/// 检测绑定列表中的组合冲突：返回每个被多个动作占用的组合。
///
/// 输出按组合字典序稳定排列，`actions` 也已排序，便于测试与日志。
#[must_use]
pub fn detect_conflicts(bindings: &[HotkeyBinding]) -> Vec<HotkeyConflict> {
    let mut map: BTreeMap<&KeyCombo, Vec<HotkeyAction>> = BTreeMap::new();
    for b in bindings {
        map.entry(&b.combo).or_default().push(b.action);
    }
    map.into_iter()
        .filter(|(_, actions)| actions.len() > 1)
        .map(|(combo, mut actions)| {
            actions.sort();
            HotkeyConflict {
                combo: combo.clone(),
                actions,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modifiers_bitor_and_contains() {
        let combo = Modifiers::CTRL | Modifiers::SHIFT;
        assert!(combo.contains(Modifiers::CTRL));
        assert!(combo.contains(Modifiers::SHIFT));
        assert!(!combo.contains(Modifiers::ALT));
        assert!(!combo.contains(Modifiers::SUPER));
    }

    #[test]
    fn defaults_have_three_bindings_and_no_conflicts() {
        let d = defaults();
        assert_eq!(d.len(), 3);
        assert!(detect_conflicts(&d).is_empty());
    }

    #[test]
    fn detects_duplicate_combo() {
        let bindings = vec![
            HotkeyBinding {
                action: HotkeyAction::TranslatePopup,
                combo: KeyCombo::new(Modifiers::CTRL | Modifiers::SHIFT, "T"),
            },
            HotkeyBinding {
                action: HotkeyAction::ShowMainWindow,
                combo: KeyCombo::new(Modifiers::CTRL | Modifiers::SHIFT, "T"),
            },
            HotkeyBinding {
                action: HotkeyAction::TranslateSelection,
                combo: KeyCombo::new(Modifiers::CTRL | Modifiers::SHIFT, "D"),
            },
        ];
        let conflicts = detect_conflicts(&bindings);
        assert_eq!(conflicts.len(), 1);
        let c = &conflicts[0];
        assert_eq!(c.actions.len(), 2);
        assert!(c.actions.contains(&HotkeyAction::TranslatePopup));
        assert!(c.actions.contains(&HotkeyAction::ShowMainWindow));
    }

    #[test]
    fn binding_roundtrips_and_action_is_snake_case() {
        let b = HotkeyBinding {
            action: HotkeyAction::ShowMainWindow,
            combo: KeyCombo::new(Modifiers::ALT, "Space"),
        };
        let json = serde_json::to_string(&b).unwrap();
        let back: HotkeyBinding = serde_json::from_str(&json).unwrap();
        assert_eq!(b, back);
        assert!(json.contains("\"show_main_window\""));
    }
}

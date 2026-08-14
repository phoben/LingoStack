//! 热键格式转换：`lingostack-core` 的 [`KeyCombo`] ↔ 快捷键字符串。
//!
//! 全局热键的实际注册由 `tauri-plugin-global-shortcut` 完成（它需要一个
//! 形如 `"Ctrl+Shift+T"` 的字符串），注册逻辑放在 `lingostack-app`——
//! 因为 `RegisterHotKey` 要求调用线程持有消息循环，而 Tauri 已独占主线程
//! 事件循环，故不自行注册。本模块只做纯粹的格式转换，可独立单测。
//!
//! 字符串格式（与插件的解析规则一致）：`+` 分隔、修饰键在前、主键在末，
//! 大小写不敏感；修饰键 token 为 `Ctrl` / `Alt` / `Shift` / `Super`。

use lingostack_core::hotkey::{KeyCombo, Modifiers};

/// 把 [`KeyCombo`] 渲染为插件可解析的快捷键字符串。
///
/// 修饰键顺序固定为 Ctrl → Alt → Shift → Super，保证同一组合总得到
/// 相同字符串（便于比较、日志与快照测试）。
///
/// 主键统一大写；空主键会产出仅含修饰键的非法串，故调用方应先校验
/// （见 [`is_valid`]）。
#[must_use]
pub fn to_accelerator(combo: &KeyCombo) -> String {
    let mut parts: Vec<&str> = Vec::new();
    if combo.mods.contains(Modifiers::CTRL) {
        parts.push("Ctrl");
    }
    if combo.mods.contains(Modifiers::ALT) {
        parts.push("Alt");
    }
    if combo.mods.contains(Modifiers::SHIFT) {
        parts.push("Shift");
    }
    if combo.mods.contains(Modifiers::SUPER) {
        parts.push("Super");
    }
    let key = combo.key.to_uppercase();
    parts.push(&key);
    parts.join("+")
}

/// 组合是否可用于注册：必须有主键，且至少一个修饰键。
///
/// 无修饰键的单键全局热键会抢占普通输入（例如单独的 `T`），一律视为非法。
#[must_use]
pub fn is_valid(combo: &KeyCombo) -> bool {
    !combo.key.trim().is_empty() && combo.mods != Modifiers::NONE
}

#[cfg(test)]
mod tests {
    use super::*;
    use lingostack_core::hotkey::{self, HotkeyAction};

    fn combo(mods: Modifiers, key: &str) -> KeyCombo {
        KeyCombo::new(mods, key)
    }

    #[test]
    fn renders_single_modifier() {
        assert_eq!(to_accelerator(&combo(Modifiers::ALT, "Space")), "Alt+SPACE");
    }

    #[test]
    fn renders_multiple_modifiers_in_fixed_order() {
        // 无论位标记如何组合，输出顺序恒为 Ctrl → Alt → Shift → Super。
        let c = combo(Modifiers::SHIFT | Modifiers::CTRL, "T");
        assert_eq!(to_accelerator(&c), "Ctrl+Shift+T");
        let c2 = combo(
            Modifiers::SUPER | Modifiers::ALT | Modifiers::CTRL | Modifiers::SHIFT,
            "K",
        );
        assert_eq!(to_accelerator(&c2), "Ctrl+Alt+Shift+Super+K");
    }

    #[test]
    fn uppercases_main_key() {
        assert_eq!(to_accelerator(&combo(Modifiers::CTRL, "t")), "Ctrl+T");
    }

    #[test]
    fn default_hotkeys_render_as_expected() {
        // 与用户确认的 Windows 默认值一致（设计文档 §7.2）。
        let rendered: Vec<String> = hotkey::defaults()
            .iter()
            .map(|b| format!("{:?}={}", b.action, to_accelerator(&b.combo)))
            .collect();
        assert!(rendered.contains(&format!("{:?}=Alt+SPACE", HotkeyAction::ShowMainWindow)));
        assert!(rendered.contains(&format!(
            "{:?}=Ctrl+Shift+D",
            HotkeyAction::TranslateSelection
        )));
    }

    #[test]
    fn all_default_hotkeys_are_valid() {
        assert!(hotkey::defaults().iter().all(|b| is_valid(&b.combo)));
    }

    #[test]
    fn rejects_missing_key() {
        assert!(!is_valid(&combo(Modifiers::CTRL, "")));
        assert!(!is_valid(&combo(Modifiers::CTRL, "   ")));
    }

    #[test]
    fn rejects_modifierless_combo() {
        // 单键全局热键会抢占普通输入。
        assert!(!is_valid(&combo(Modifiers::NONE, "T")));
    }
}

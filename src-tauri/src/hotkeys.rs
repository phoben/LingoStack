//! 全局热键注册与冲突上报（设计文档 §7.2 / §9）。
//!
//! 注册走 `tauri-plugin-global-shortcut`——`RegisterHotKey` 要求调用线程持有
//! 消息循环，而 Tauri 已独占主线程事件循环，故不自行注册。
//!
//! **注册失败即视为冲突**（被系统或其他应用占用），逐条上报给前端在设置页标红，
//! 不中断启动：部分热键不可用时其余仍应生效。

use lingostack_core::hotkey::{HotkeyAction, HotkeyBinding};
use lingostack_hook::accelerator;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// 单条热键的注册结果，用于前端设置页展示（冲突标红）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HotkeyStatus {
    pub action: HotkeyAction,
    /// 渲染后的快捷键字符串（如 `"Ctrl+Shift+T"`）。
    pub accelerator: String,
    pub registered: bool,
    /// 失败原因；`registered` 为 true 时为 `None`。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 前端监听的事件名——热键注册完毕后推送全部状态。
pub const HOTKEY_STATUS_EVENT: &str = "hotkey-status";

/// 主窗口 label，须与 `tauri.conf.json` 一致。
const MAIN_WINDOW: &str = "main";

/// 热键触发后要执行的动作——纯枚举，便于单测分发逻辑。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotkeyEffect {
    /// 显示并聚焦主窗口。
    ShowMainWindow,
    /// 通知前端：以当前选中文本发起翻译。
    TranslateSelection,
}

/// 由热键动作映射到副作用。
///
/// 抽成纯函数以便单测；副作用施加见 [`apply_effect`]。
#[must_use]
pub fn effect_for(action: HotkeyAction) -> HotkeyEffect {
    match action {
        HotkeyAction::ShowMainWindow => HotkeyEffect::ShowMainWindow,
        HotkeyAction::TranslateSelection => HotkeyEffect::TranslateSelection,
    }
}

/// 注册全部热键，返回逐条结果。
///
/// 跳过非法组合（无主键或无修饰键，见 [`accelerator::is_valid`]）并标记为失败，
/// 避免把「单键抢占普通输入」的配置注册上去。
pub fn register_all(app: &AppHandle, bindings: &[HotkeyBinding]) -> Vec<HotkeyStatus> {
    let shortcuts = app.global_shortcut();
    bindings
        .iter()
        .map(|binding| {
            let acc = accelerator::to_accelerator(&binding.combo);
            if !accelerator::is_valid(&binding.combo) {
                return HotkeyStatus {
                    action: binding.action,
                    accelerator: acc,
                    registered: false,
                    error: Some("组合非法：需至少一个修饰键与一个主键".into()),
                };
            }
            let action = binding.action;
            let app_for_handler = app.clone();
            // 注册失败即冲突（系统或其他应用已占用该组合）。
            match shortcuts.on_shortcut(acc.as_str(), move |_app, _shortcut, event| {
                // 只在按下时触发，避免释放时重复执行。
                if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    apply_effect(&app_for_handler, effect_for(action));
                }
            }) {
                Ok(()) => HotkeyStatus {
                    action,
                    accelerator: acc,
                    registered: true,
                    error: None,
                },
                Err(e) => HotkeyStatus {
                    action,
                    accelerator: acc,
                    registered: false,
                    error: Some(format!("注册失败（疑似与系统或其他应用冲突）: {e}")),
                },
            }
        })
        .collect()
}

/// 注册热键并把结果推送给前端（设置页据此标红冲突项）。
pub fn register_and_report(app: &AppHandle, bindings: &[HotkeyBinding]) {
    let statuses = register_all(app, bindings);
    let conflicts = statuses.iter().filter(|s| !s.registered).count();
    if conflicts > 0 {
        // 不中断启动：其余热键仍可用；前端负责提示。
        eprintln!("[hotkey] {conflicts} 个热键注册失败，已上报前端");
    }
    let _ = app.emit(HOTKEY_STATUS_EVENT, &statuses);
}

/// 用新配置替换本应用的注册项并返回完整状态；失败项不影响其它项。
pub fn reregister_and_report(app: &AppHandle, bindings: &[HotkeyBinding]) -> Vec<HotkeyStatus> {
    let _ = app.global_shortcut().unregister_all();
    let statuses = register_all(app, bindings);
    let _ = app.emit(HOTKEY_STATUS_EVENT, &statuses);
    statuses
}

/// 施加热键副作用。
fn apply_effect(app: &AppHandle, effect: HotkeyEffect) {
    match effect {
        HotkeyEffect::ShowMainWindow => {
            if let Some(w) = app.get_webview_window(MAIN_WINDOW) {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }
        // 划词翻译：显示主窗口，前端收到事件后切到翻译视图、
        // 取词、填充原文并自动翻译（见 App.tsx 的 translate-selection 监听）。
        HotkeyEffect::TranslateSelection => {
            if let Some(w) = app.get_webview_window(MAIN_WINDOW) {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            let _ = app.emit("translate-selection", ());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn effect_mapping_covers_all_actions() {
        assert_eq!(
            effect_for(HotkeyAction::ShowMainWindow),
            HotkeyEffect::ShowMainWindow
        );
        assert_eq!(
            effect_for(HotkeyAction::TranslateSelection),
            HotkeyEffect::TranslateSelection
        );
    }

    #[test]
    fn status_serializes_without_error_field_when_ok() {
        let s = HotkeyStatus {
            action: HotkeyAction::ShowMainWindow,
            accelerator: "Alt+SPACE".into(),
            registered: true,
            error: None,
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"registered\":true"));
        assert!(!json.contains("error"));
        assert!(json.contains("show_main_window"));
    }

    #[test]
    fn status_serializes_error_when_conflicted() {
        let s = HotkeyStatus {
            action: HotkeyAction::TranslateSelection,
            accelerator: "Ctrl+Shift+T".into(),
            registered: false,
            error: Some("冲突".into()),
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"registered\":false"));
        assert!(json.contains("冲突"));
    }
}

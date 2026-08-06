//! 系统托盘：图标常驻 + 左键单击/双击 + 右键菜单。
//!
//! 右键菜单由 Tauri 2 原生 `Menu` 渲染（样式跟随系统），项：
//! 「主窗口」「设置」「退出」。左键交互见 [`setup_tray`] 的事件处理。
//!
//! 平台差异由 Tauri 统一抽象；如需平台特化，再按 `#[cfg(target_os)]` 分文件。

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

/// 主窗口 label，须与 `tauri.conf.json` 中 `app.windows[0].label` 保持一致。
const MAIN_WINDOW: &str = "main";

/// 对主窗口施加的可见性动作：纯枚举，便于 [`toggle_action`] 单测。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowAction {
    /// 显示并聚焦（含取消最小化）。
    Show,
    /// 隐藏到托盘。
    Hide,
}

/// 依据主窗口当前的「对用户可见」状态，决定 toggle 应执行的动作。
///
/// 最小化也视为不可见——单击处于最小化的窗口时，应恢复而非隐藏。
pub fn toggle_action(visible: bool, minimized: bool) -> WindowAction {
    if visible && !minimized {
        WindowAction::Hide
    } else {
        WindowAction::Show
    }
}

/// 创建并注册系统托盘。在 `tauri::Builder::setup` 中调用一次。
///
/// 失败通常意味着打包配置缺失（如图标未注入），启动期直接报错更易定位。
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let icon = app
        .default_window_icon()
        .expect("默认窗口图标缺失：请检查 tauri.conf.json 的 bundle.icon")
        .clone();

    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "main", "主窗口", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?,
            &MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?,
        ],
    )?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("LingoStack · 译栈")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| handle_tray_event(tray.app_handle(), event))
        .on_menu_event(handle_menu_event)
        .build(app)?;

    Ok(())
}

/// 托盘图标鼠标事件：左键单击切换可见性，左键双击显示并聚焦。
///
/// 实现权衡（刻意不做点击去抖）：双击会先触发一次 `Click` 再触发 `DoubleClick`，
/// 故双击的实际序列是 toggle→show。隐藏态下最终结果仍为「显示」；仅在窗口
/// 已显示时双击会出现一次短暂 hide→show 闪烁，属可接受的边缘情形。
/// 若实测体感不佳，再引入短延迟去抖。
fn handle_tray_event(app: &AppHandle, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } => apply_window_action(app, toggle_action_for_main(app)),
        TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        } => apply_window_action(app, WindowAction::Show),
        _ => {}
    }
}

/// 右键菜单事件分发。
fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "main" => apply_window_action(app, WindowAction::Show),
        // 当前无独立设置页：打开主窗口即可；V1 设置 tab 就绪后改为前端导航。
        "settings" => apply_window_action(app, WindowAction::Show),
        "quit" => app.exit(0),
        _ => {}
    }
}

/// 读取主窗口状态计算 toggle 动作；窗口不存在时返回 [`WindowAction::Show`]（无害）。
fn toggle_action_for_main(app: &AppHandle) -> WindowAction {
    match app.get_webview_window(MAIN_WINDOW) {
        Some(w) => toggle_action(
            w.is_visible().unwrap_or(false),
            w.is_minimized().unwrap_or(false),
        ),
        None => WindowAction::Show,
    }
}

/// 对主窗口施加指定动作。
fn apply_window_action(app: &AppHandle, action: WindowAction) {
    let Some(w) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    match action {
        WindowAction::Show => {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
        WindowAction::Hide => {
            let _ = w.hide();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toggle_when_visible_and_not_minimized_hides() {
        assert_eq!(toggle_action(true, false), WindowAction::Hide);
    }

    #[test]
    fn toggle_when_minimized_shows() {
        // 最小化仍判定为不可见：单击应恢复窗口，而非把它藏起来
        assert_eq!(toggle_action(true, true), WindowAction::Show);
    }

    #[test]
    fn toggle_when_hidden_shows() {
        assert_eq!(toggle_action(false, false), WindowAction::Show);
    }

    #[test]
    fn toggle_when_hidden_and_minimized_shows() {
        assert_eq!(toggle_action(false, true), WindowAction::Show);
    }
}

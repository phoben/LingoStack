//! # lingostack-app
//!
//! Tauri 入口 crate（仓库内唯一依赖 `tauri` 的 crate）。
//! 职责：窗口管理、IPC commands 组装、配置读写、单实例锁、托盘驻留。

mod commands;
mod config;

use std::path::PathBuf;

use tauri::Manager;

/// 应用全局状态：持有配置文件路径，供 IPC commands 共享。
struct AppState {
    config_path: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // 单实例锁（仅桌面）：第二实例启动时聚焦已有主窗口，而非新开。
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .manage(AppState {
            config_path: config::config_path(),
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_config,
            commands::save_config,
            commands::effective_prompt,
            commands::chat_stream,
        ])
        .setup(|app| {
            lingostack_hook::setup_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//! # lingostack-app
//!
//! Tauri 入口 crate（仓库内唯一依赖 `tauri` 的 crate）。
//! 职责：窗口管理、IPC commands 组装、配置读写、单实例锁、托盘驻留。

mod commands;
mod config;
mod hotkeys;

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

    // WDIO plugins are test-only: the `e2e` feature is enabled exclusively by
    // the E2E build wrapper, never by the normal or release build.
    #[cfg(feature = "e2e")]
    {
        builder = builder
            .plugin(tauri_plugin_wdio::init())
            .plugin(tauri_plugin_wdio_webdriver::init());
    }

    let config_path = config::config_path();

    builder
        .manage(AppState {
            config_path: config_path.clone(),
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::load_config,
            commands::save_config,
            commands::effective_prompt,
            commands::chat_stream,
            commands::get_selection,
            commands::speak,
            commands::stop_speaking,
        ])
        .setup(move |app| {
            let handle = app.handle();
            lingostack_hook::setup_tray(handle)?;
            // 按配置注册全局热键；失败逐条上报前端（设置页标红），不中断启动。
            let cfg = config::load(&config_path).unwrap_or_default();
            hotkeys::register_and_report(handle, &cfg.hotkeys);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

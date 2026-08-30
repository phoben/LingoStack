//! # lingostack-app
//!
//! Tauri 入口 crate（仓库内唯一依赖 `tauri` 的 crate）。
//! 职责：窗口管理、IPC commands 组装、配置读写、单实例锁、托盘驻留。

mod commands;
mod config;
mod hotkeys;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::webview::PageLoadEvent;
use tauri::Manager;

/// 应用全局状态：持有配置文件路径，供 IPC commands 共享。
struct AppState {
    config_path: PathBuf,
    /// 所有请求共用的限流截止时间；429 后避免并发请求立即再次撞限流。
    rate_limit_until: Arc<Mutex<Option<Instant>>>,
    documents: Arc<Mutex<lingostack_document::DocumentModule>>,
    document_limits: lingostack_docparse::ParseLimits,
    document_jobs: Arc<Mutex<HashMap<String, Arc<DocumentJobControl>>>>,
}

/// Cooperative controls are checked between provider requests; an in-flight
/// request is allowed to finish so no provider work is abandoned mid-stream.
pub(crate) struct DocumentJobControl {
    /// Serializes the final persistence step with pause/cancel requests so a
    /// provider response that arrives late cannot overwrite a paused job.
    pub(crate) lifecycle: Mutex<()>,
    pub(crate) pause_requested: AtomicBool,
    pub(crate) cancel_requested: AtomicBool,
}

fn should_reveal_main_window(label: &str, event: PageLoadEvent) -> bool {
    label == "main" && matches!(event, PageLoadEvent::Finished)
}

fn take_initial_main_window_reveal(
    pending: &AtomicBool,
    label: &str,
    event: PageLoadEvent,
) -> bool {
    should_reveal_main_window(label, event) && pending.swap(false, Ordering::AcqRel)
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
    let document_db_path = config_path.with_file_name("documents.sqlite3");
    let document_limits = lingostack_docparse::ParseLimits::from_environment();
    let mut documents =
        lingostack_document::DocumentModule::open(&document_db_path, document_limits)
            .expect("document database must open before commands are exposed");
    documents
        .pause_active_jobs()
        .expect("document job recovery must succeed before commands are exposed");

    #[cfg(feature = "e2e")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        commands::load_config,
        commands::save_config,
        commands::effective_prompt,
        commands::translation_plan,
        commands::effective_translation_prompt,
        commands::chat_stream,
        commands::get_selection,
        commands::speak,
        commands::stop_speaking,
        commands::register_hotkeys,
        commands::list_documents,
        commands::document_limits,
        commands::import_document,
        commands::document_content,
        commands::delete_document,
        commands::translate_document,
        commands::pause_document,
        commands::cancel_document,
        commands::e2e_emit_translate_selection,
        commands::e2e_emit_hotkey_status,
    ]);
    #[cfg(not(feature = "e2e"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        commands::load_config,
        commands::save_config,
        commands::effective_prompt,
        commands::translation_plan,
        commands::effective_translation_prompt,
        commands::chat_stream,
        commands::get_selection,
        commands::speak,
        commands::stop_speaking,
        commands::register_hotkeys,
        commands::list_documents,
        commands::document_limits,
        commands::import_document,
        commands::document_content,
        commands::delete_document,
        commands::translate_document,
        commands::pause_document,
        commands::cancel_document,
    ]);

    let pending_main_window_reveal = AtomicBool::new(true);

    builder
        // Keep the native window hidden while WebView2 is still painting its
        // default background. The finished event runs after the document,
        // theme preload, stylesheet, and synchronous React mount are ready.
        .on_page_load(move |webview, payload| {
            if take_initial_main_window_reveal(
                &pending_main_window_reveal,
                webview.label(),
                payload.event(),
            ) {
                let _ = webview.window().show();
            }
        })
        // 主窗口关闭（包括 Alt+F4）只隐藏到托盘。真正退出只能由托盘的
        // “退出”动作触发；这样托盘始终能重新显示同一个窗口。
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .manage(AppState {
            config_path: config_path.clone(),
            rate_limit_until: Arc::new(Mutex::new(None)),
            documents: Arc::new(Mutex::new(documents)),
            document_limits,
            document_jobs: Arc::new(Mutex::new(HashMap::new())),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_window_starts_hidden_until_first_page_is_ready() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();

        assert_eq!(config["app"]["windows"][0]["label"], "main");
        assert_eq!(config["app"]["windows"][0]["visible"], false);
    }

    #[test]
    fn only_first_finished_main_page_reveals_the_window() {
        let pending = AtomicBool::new(true);

        assert!(!take_initial_main_window_reveal(
            &pending,
            "main",
            PageLoadEvent::Started
        ));
        assert!(!take_initial_main_window_reveal(
            &pending,
            "secondary",
            PageLoadEvent::Finished
        ));
        assert!(take_initial_main_window_reveal(
            &pending,
            "main",
            PageLoadEvent::Finished
        ));
        assert!(!take_initial_main_window_reveal(
            &pending,
            "main",
            PageLoadEvent::Finished
        ));
    }
}

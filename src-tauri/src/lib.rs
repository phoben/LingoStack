//! # lingostack-app
//!
//! Tauri 入口 crate（仓库内唯一依赖 `tauri` 的 crate）。
//! 负责窗口管理、IPC commands / events 组装。
//!
//! 已接入系统托盘驻留（`lingostack_hook::setup_tray`）；V0 占位 IPC command
//! 保留以验证前后端链路，V1 替换为真实业务命令。

/// V0 占位 IPC command：返回应用标记串（含 core crate 名，顺带验证 workspace 依赖链路）。
/// V1 替换为真实业务命令。
#[tauri::command]
fn app_info() -> String {
    format!(
        "LingoStack V0 scaffolding (core={})",
        lingostack_core::CRATE_NAME
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![app_info])
        .setup(|app| {
            lingostack_hook::setup_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_mentions_core() {
        let info = app_info();
        assert!(info.contains("lingostack-core"));
    }
}

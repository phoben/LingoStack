//! # lingostack-app
//!
//! Tauri 入口 crate（仓库内唯一依赖 `tauri` 的 crate）。
//! 负责窗口管理、IPC commands / events 组装。
//!
//! V0：仅注册一个空 IPC command，证明前后端链路连通。

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

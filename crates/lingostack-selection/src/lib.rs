//! # lingostack-selection
//!
//! 系统取词：读取当前应用中选中的文本。
//!
//! **平台差异用 trait 抽象、按 `target` 分文件隔离**（见 `windows.rs` /
//! `macos.rs` / `linux.rs`），禁止在调用侧写 `if windows/mac` 分支。
//! V0 仅声明 trait；V1 实现各平台。

use serde::{Deserialize, Serialize};

/// 一次取词结果（V0 占位，V1 补充屏幕坐标）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selection {
    /// 选中的文本。
    pub text: String,
}

/// 取词统一抽象。具体实现按平台分文件隔离。
pub trait SelectionProvider: Send + Sync {
    /// 读取当前选中文本。取词失败由调用方降级（权限引导 + 剪贴板）。
    fn get_selection(&self) -> Result<Selection, SelectionError>;
}

/// 取词错误。
#[derive(Debug, thiserror::Error)]
pub enum SelectionError {
    #[error("未选中文本")]
    Empty,
    #[error("取词失败: {0}")]
    Failed(String),
}

// 平台实现入口（V1 填充具体逻辑）。
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(test)]
mod tests {
    use super::*;

    struct ClipboardProvider;
    impl SelectionProvider for ClipboardProvider {
        fn get_selection(&self) -> Result<Selection, SelectionError> {
            Ok(Selection {
                text: "clip".into(),
            })
        }
    }

    #[test]
    fn smoke() {
        let provider = ClipboardProvider;
        assert_eq!(provider.get_selection().unwrap().text, "clip");
    }
}

//! # lingostack-selection
//!
//! 系统取词：读取当前应用中选中的文本。
//!
//! **平台差异用 trait 抽象、按 `target` 分文件隔离**（见 `windows.rs` /
//! `macos.rs` / `linux.rs`），禁止在调用侧写 `if windows/mac` 分支。

use serde::{Deserialize, Serialize};

/// 取词来源——UI 需据此提示用户（如降级到剪贴板时给出说明，见设计文档 §9）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectionSource {
    /// 由系统辅助 API（Win UIA / macOS AX / Linux AT-SPI）直接读取选区。
    Accessibility,
    /// 辅助 API 不可用时降级为剪贴板内容。
    Clipboard,
}

/// 一次取词结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selection {
    /// 选中的文本。
    pub text: String,
    /// 该文本的获取途径。
    pub source: SelectionSource,
}

/// 取词统一抽象。具体实现按平台分文件隔离。
pub trait SelectionProvider: Send + Sync {
    /// 读取当前选中文本。
    ///
    /// 实现应在辅助 API 失败时自行降级（剪贴板），并以
    /// [`Selection::source`] 标明来源；仅在完全无法取得文本时返回 `Err`。
    fn get_selection(&self) -> Result<Selection, SelectionError>;
}

/// 取词错误。
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SelectionError {
    /// 辅助 API 与剪贴板均无可用文本。
    #[error("未选中文本")]
    Empty,
    /// 辅助权限未授予（macOS 需在系统设置中授权）。
    #[error("辅助功能权限未授予: {0}")]
    PermissionDenied(String),
    /// 平台调用失败。
    #[error("取词失败: {0}")]
    Failed(String),
    /// 当前平台尚未实现。
    #[error("当前平台暂不支持取词")]
    Unsupported,
}

// 平台实现入口。
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

/// 返回当前平台的取词实现。
///
/// macOS / Linux 目前返回 [`SelectionError::Unsupported`] 的占位实现，
/// 需在目标平台上验证后补齐（见各平台模块）。
#[must_use]
pub fn provider() -> Box<dyn SelectionProvider> {
    #[cfg(target_os = "windows")]
    {
        Box::new(windows::WindowsSelection::new())
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacosSelection::new())
    }
    #[cfg(target_os = "linux")]
    {
        Box::new(linux::LinuxSelection::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct StubProvider(SelectionSource);
    impl SelectionProvider for StubProvider {
        fn get_selection(&self) -> Result<Selection, SelectionError> {
            Ok(Selection {
                text: "clip".into(),
                source: self.0,
            })
        }
    }

    #[test]
    fn trait_is_object_safe_and_reports_source() {
        let p: Box<dyn SelectionProvider> = Box::new(StubProvider(SelectionSource::Clipboard));
        let sel = p.get_selection().unwrap();
        assert_eq!(sel.text, "clip");
        assert_eq!(sel.source, SelectionSource::Clipboard);
    }

    #[test]
    fn source_serializes_snake_case() {
        let json = serde_json::to_string(&SelectionSource::Accessibility).unwrap();
        assert_eq!(json, "\"accessibility\"");
    }

    #[test]
    fn platform_provider_is_constructible() {
        // 各平台都应能构造出实现（Windows 为真实实现，其余为占位）。
        let _p = provider();
    }
}

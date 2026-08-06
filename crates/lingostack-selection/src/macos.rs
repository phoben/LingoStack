//! macOS 取词实现（Accessibility API）。
//!
//! **待在目标平台实现与验证**：需经 `AXUIElementCopyAttributeValue` 读取
//! `kAXSelectedTextAttribute`，并要求用户在「系统设置 → 隐私与安全性 →
//! 辅助功能」中授权；未授权时应返回
//! [`SelectionError::PermissionDenied`] 以触发 UI 的权限引导（§9）。
//!
//! 当前为占位实现，返回 [`SelectionError::Unsupported`]。

use crate::{Selection, SelectionError, SelectionProvider};

/// macOS 取词提供者（占位）。
pub struct MacosSelection;

impl MacosSelection {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Default for MacosSelection {
    fn default() -> Self {
        Self::new()
    }
}

impl SelectionProvider for MacosSelection {
    fn get_selection(&self) -> Result<Selection, SelectionError> {
        Err(SelectionError::Unsupported)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholder_reports_unsupported() {
        assert_eq!(
            MacosSelection::new().get_selection().unwrap_err(),
            SelectionError::Unsupported
        );
    }
}

//! Linux 取词实现（AT-SPI）。
//!
//! **待在目标平台实现与验证**：需经 D-Bus 与 AT-SPI2 读取焦点对象的
//! `Text` 接口选区；X11 下亦可用 PRIMARY selection 作为补充路径。
//! AT-SPI 完善列为 V2（见设计文档 §13）。
//!
//! 当前为占位实现，返回 [`SelectionError::Unsupported`]。

use crate::{Selection, SelectionError, SelectionProvider};

/// Linux 取词提供者（占位）。
pub struct LinuxSelection;

impl LinuxSelection {
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Default for LinuxSelection {
    fn default() -> Self {
        Self::new()
    }
}

impl SelectionProvider for LinuxSelection {
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
            LinuxSelection::new().get_selection().unwrap_err(),
            SelectionError::Unsupported
        );
    }
}

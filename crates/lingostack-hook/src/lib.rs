//! # lingostack-hook
//!
//! 全局热键、托盘、单实例锁。平台差异按 `#[cfg(target_os)]` 分文件隔离
//! （同 [`lingostack-selection`]）。

pub mod tray;

pub use tray::setup_tray;

#[cfg(test)]
mod tests {
    #[test]
    fn smoke() {
        assert_eq!(1 + 1, 2);
    }
}

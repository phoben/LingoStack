//! # lingostack-hook
//!
//! 全局热键、托盘、单实例锁。V0 占位，V1 实现。
//! 平台差异按 `target` 分文件隔离（同 [`lingostack-selection`]）。

#[cfg(test)]
mod tests {
    #[test]
    fn smoke() {
        assert_eq!(1 + 1, 2);
    }
}

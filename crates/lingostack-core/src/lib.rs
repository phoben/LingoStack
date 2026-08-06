//! # lingostack-core
//!
//! 纯逻辑核心：配置模型、语言判定、事件总线、热键冲突检测、Prompt 构建。
//!
//! **本 crate 严禁依赖 `tauri` 或任何需要系统能力的库**——保持可独立单测。
//! CI 通过 `cargo tree -p lingostack-core | grep tauri` 校验纯净性。

#![forbid(unsafe_code)]

/// V0 占位常量：标识本 crate。V1 替换为真实逻辑后移除。
pub const CRATE_NAME: &str = "lingostack-core";

// === V1 待实现模块（V0 仅占位，保持空壳可编译）===
// mod config;   // 配置序列化模型
// mod lang;     // 语言判定与目标语言规则（设计文档 §5）
// mod hotkey;   // 热键冲突检测逻辑
// mod prompt;   // Prompt 构建

#[cfg(test)]
mod tests {
    use super::CRATE_NAME;

    #[test]
    fn smoke() {
        assert_eq!(CRATE_NAME, "lingostack-core");
    }
}

//! # lingostack-core
//!
//! 纯逻辑核心：配置模型、语言判定、热键冲突检测、Prompt 构建。
//!
//! **本 crate 严禁依赖 `tauri` 或任何需要系统能力的库**——保持可独立单测。
//! CI 通过 `cargo tree -p lingostack-core | grep tauri` 校验纯净性。

#![forbid(unsafe_code)]

pub mod config;
pub mod hotkey;
pub mod lang;
pub mod naming;
pub mod prompt;

/// 标识本 crate，供 `app_info` IPC 链路自检。
pub const CRATE_NAME: &str = "lingostack-core";

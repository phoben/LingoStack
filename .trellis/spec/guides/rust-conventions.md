# Rust 通用约定

> 7 个 crate 共享的写法。新增 crate 或改动现有 crate 时照此对齐。

## 错误类型

每个 crate 一个扁平错误枚举，用 `thiserror`（workspace 统一 `"2"`）：

```rust
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ResolveError {
    #[error("功能 {feature:?} 未配置默认模型，亦无全局兜底")]
    Unassigned { feature: Feature },
    #[error("模型引用的提供商 `{provider_id}` 不存在")]
    UnknownProvider { provider_id: String },
}
```

约定：

- 命名带领域前缀（`ResolveError` / `LlmError` / `SelectionError` / `TtsError` / `ConfigError`），不叫裸 `Error`
- 变体名是状态描述（`Unassigned` / `UnknownProvider` / `Unsupported` / `Timeout`），不用 `Failed*` 后缀
- **命名字段的 struct 变体**，不用 tuple 变体——这样 `#[error(...)]` 格式串能按名引用
- 错误信息用中文，面向用户
- **无 `#[from]`、无错误嵌套、无 anyhow**。全是扁平枚举
- **无 `type Result<T>` 别名**。函数签名写全 `Result<&ModelRef, ResolveError>`（`config.rs:149`）

`PartialEq, Eq` 按需加：`ResolveError` 加了，测试就能直接 `assert_eq!` 比对错误（`config.rs:326-331`）；`LlmError` 没加，因为它含 `Status { body: String }`。

分类谓词方法可以有（`LlmError::is_retryable()` / `is_rate_limited()`，`llm/src/lib.rs:118-131`）——但注意**这两个当前生产代码零调用**，见 [IPC 契约指南](./ipc-contract-guide.md) 与 `lingostack-llm` 的 spec。

## 测试

- **一律内联** `#[cfg(test)] mod tests { use super::*; ... }`，置于文件底部。**全仓库没有 `tests/` 目录**
- 命名 `<主体>_<行为或条件>`，snake_case 完整句式，**不加 `test_` 前缀**：`resolve_uses_feature_default_first`、`missing_fields_fill_defaults_on_deserialize`、`streams_deltas_and_sends_bearer_auth`
- 断言只用 `assert_eq!` / `assert!` / `assert!(matches!(...))`。**无第三方断言库**
- 异步测试用 `#[tokio::test]`
- 每个文件按需写自己的本地工厂函数（如 `sample_provider()`，`config.rs:252-261`），**不跨文件共享 fixture**
- serde 类型必写往返测试（序列化→反序列化→断言）：`config.rs:366-383`、`hotkey.rs:172-182`、`lang.rs:122-128`
- 测试内用简短中文注释解释非显然的断言（例：`config.rs:276` 解释掩码位数算法）

## 密钥处理

API Key 绝不进日志、错误信息、`Debug` 输出。两种既有策略，按情况选：

- **不 derive `Debug`**：`lingostack-llm` 三个 provider struct 完全无 derive（`openai.rs:52`、`anthropic.rs:73`、`gemini.rs:84`），结构上不可能通过 `{:?}` 泄漏
- **手写 `Debug` 做脱敏**：`ProviderConfig` 需要 `Debug`，于是手写 impl 把 `api_key` 替换成 `"<redacted>"`（`config.rs:52-63`），另有 `redact()` + `mask_secret()` 提供部分掩码预览（`config.rs:66-101`）

Key 出现在 URL 里时（Gemini）必须在错误路径主动擦除，见 `lingostack-llm` 的 spec。

## 日志

**全仓库无 `tracing` / `log` / `env_logger`**。唯一的运行时输出是 `src-tauri/src/hotkeys.rs:106` 的一处 `eprintln!`。

不要为单个需求引入日志框架。真要引入，先做为技术决策记录，并同时处理密钥脱敏。

## 依赖

- 共享依赖统一在根 `Cargo.toml` 的 `[workspace.dependencies]`，成员用 `{ workspace = true }` 引用
- 版本对齐传递依赖以避免重复编译（`windows = "0.61"` 注释写明对齐 tauri）
- `reqwest` 用 `rustls-tls` 免系统 OpenSSL，Windows 友好
- **零遥测**：不引入任何统计 / 崩溃上报依赖
- 小需求不引库：手写 bitfield 而非 `bitflags`（`hotkey.rs:7`），手写 IndexedDB 封装而非 `idb`（前端同理）

## crate 纯净性只约束 `lingostack-core`

`lingostack-core` 禁依赖 `tauri`，CI 在三平台上跑 `cargo tree -p lingostack-core | grep -iw tauri` 强制（`.github/workflows/ci.yml:58-65`）。

**这条规则不外推**。`lingostack-hook` 正常依赖 `tauri`（`hook/Cargo.toml:11`），符合设计。

## 质量门禁

```bash
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings    # 零警告
cargo test --workspace
cargo tree -p lingostack-core | grep tauri   # 应无输出
```

`lingostack-core` 带 `#![forbid(unsafe_code)]`（`core/src/lib.rs:8`）。含平台原生调用的 crate 不设此约束。

## lib.rs 只做命名空间

各 crate 的 `lib.rs` 只声明模块，**不做 `pub use` 门面**（`core/src/lib.rs:10-14`）。消费方走全路径：`use lingostack_core::config::{AppConfig, Feature};`

例外：`lingostack-selection` / `lingostack-tts` 的 `lib.rs` 额外承载 trait 定义与工厂函数，这是平台隔离模式要求的。

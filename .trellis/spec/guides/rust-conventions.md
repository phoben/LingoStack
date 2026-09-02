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

分类谓词方法可以有（`LlmError::is_retryable()` / `is_rate_limited()`，`llm/src/lib.rs`）；当前由 Tauri 应用层 `chat_stream` 消费以实现零输出单次重试与共享 429 冷却，见 [IPC 契约指南](./ipc-contract-guide.md) 与 `lingostack-llm` 的 spec。

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

## Rust 工具链与 MSRV 契约

### 1. Scope / Trigger

新增或升级 workspace Rust 依赖、调整 CI 工具链、修改 `rust-version`，或安全公告要求跨 MSRV 升级时，必须核对本节。该契约用于避免 `Cargo.toml` 宣称的最低版本低于实际依赖要求。

### 2. Signatures

```toml
[workspace.package]
edition = "2021"
rust-version = "1.85"
```

`rust-toolchain.toml` 继续使用 `stable`，不固定具体 patch 版本；所有 8 个 workspace package 通过 `rust-version.workspace = true` 继承最低 Rust 1.85。

### 3. Contracts

- 新依赖及其完整传递依赖必须支持 Rust 1.85 或更低；不能只检查直接依赖的 MSRV。
- 安全公告的 patched range 优先于维持旧 MSRV。若安全版本要求更高 Rust，必须先明确记录兼容性影响，再同步 workspace `rust-version`。
- 不得通过 audit ignore、选取仍受影响的中间版本或把 `rust-version` 留在虚假低值来保持门禁表面通过。
- 2026-09 安全基线至少包含 `h2 >= 0.4.16`、`lopdf >= 0.42.0`、`quick-xml >= 0.41.0`；升级后必须保留文档解析回归测试与第三方声明同步。

### 4. Validation & Error Matrix

| 条件                                          | 必须结果                                                      |
| --------------------------------------------- | ------------------------------------------------------------- |
| 依赖声明的 MSRV 高于 workspace `rust-version` | 提升并记录 workspace MSRV，或选择同样已修复且受维护的兼容依赖 |
| RustSec patched range 与候选版本不符          | 拒绝候选版本，不允许 audit ignore                             |
| 升级改变解析器事件/API                        | 适配行为并新增真实输入回归测试                                |
| 许可证/依赖树变化                             | 重新生成 `THIRD_PARTY_NOTICES` 并核对锁文件                   |

### 5. Good / Base / Bad Cases

- **Good**：官方公告、crate metadata、依赖树和 workspace MSRV 一致，完整门禁通过。
- **Base**：本机缺少 `cargo-audit` 时，可先核对官方 patched range 与精确依赖树，但仍必须由 CI `cargo audit` 给最终实时公告证据。
- **Bad**：公告要求 `lopdf >= 0.42`，却为了保留 Rust 1.80 选择仍受影响的 `lopdf 0.36`。

### 6. Tests Required

```powershell
cargo metadata --format-version 1
cargo tree -i h2
cargo tree -i lopdf
cargo tree -i quick-xml
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
pnpm notices:generate
git diff --check
```

CI 还必须在 Windows、Linux、macOS 运行 Rust 门禁并执行 `cargo audit`；单平台本地通过不能代替跨平台证据。

### 7. Wrong vs Correct

```text
Wrong: 保留 rust-version=1.80 → 选择未修复依赖或忽略公告 → 门禁假绿
Correct: 核对官方 patched range → 升级安全依赖 → 将 workspace MSRV 同步为 1.85 → 全仓与三平台验证
```

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

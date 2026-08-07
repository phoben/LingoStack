# 模块职责

`src/lib.rs` 只声明模块，无 `pub use` 门面。消费方走全路径引用：`use lingostack_core::config::{AppConfig, Feature};`

## 五个模块

| 模块 | 职责 | 主要类型 |
|------|------|----------|
| `config.rs`（394 行） | 配置根、提供商配置、模型分配与解析、密钥脱敏 | `AppConfig`、`ProviderConfig`、`ProviderKind`、`ModelRef`、`Feature`、`ModelAssignment`、`ResolveError`、`Theme`、`RedactedProvider` |
| `hotkey.rs`（183 行） | 修饰键位域、按键组合、热键动作与绑定、冲突检测 | `Modifiers`、`KeyCombo`、`HotkeyAction`、`HotkeyBinding`、`HotkeyConflict`、`defaults()`、`detect_conflicts()` |
| `lang.rs`（168 行） | 语言枚举、字符集粗判、目标语言解析规则 | `Language`、`resolve_target_language()` |
| `naming.rs`（75 行） | 标识符命名风格枚举 | `NamingStyle` |
| `prompt.rs`（146 行） | 内置 Prompt 常量 + 用户覆盖 | `TRANSLATE_PROMPT` / `NAMING_PROMPT` / `EXPLAIN_PROMPT`、`PromptOverrides` |

## 依赖方向

`config.rs` 是唯一的聚合点，它 import 其余四个模块把它们组合进 `AppConfig`（`config.rs:12-15`）。其余四个模块**互不依赖**。

新增模块时保持这个形状：要么是独立的领域概念，要么被 `config.rs` 聚合。不要让 `lang.rs` 去 import `hotkey.rs` 这类横向依赖。

## 什么不该放进来

本 crate 是纯逻辑。以下都不属于这里：

- 文件读写 → `src-tauri/src/config.rs`
- 系统能力（取词 / 朗读 / 热键注册 / 托盘）→ 对应专用 crate
- HTTP 请求 → `lingostack-llm`
- 任何 `tauri` 类型 → CI 会红

判断标准：**这段逻辑能不能只靠内存里的值做单元测试**。能，就放这儿；需要环境、需要系统、需要网络，就不放。

热键这块的分工是个好例子：**冲突检测规则**（纯逻辑）在本 crate 的 `hotkey.rs`；**加速器字符串渲染**在 `lingostack-hook/src/accelerator.rs`；**实际注册与冲突上报**在 `src-tauri/src/hotkeys.rs`。

## 模块内文件组织

每个模块一个文件，模块底部内联 `#[cfg(test)] mod tests`。当前无子模块目录，模块变大时优先考虑拆成新的顶层模块，而不是建 `config/` 目录——保持扁平。

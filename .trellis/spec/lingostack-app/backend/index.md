# lingostack-app（Tauri 入口）开发规范

> 包名 `lingostack-app`，物理路径 `src-tauri/`（Tauri 2 CLI 约定：Rust 代码与 `tauri.conf.json` 必须在此目录）。**仓库内唯一依赖 `tauri` 的应用层 crate**，负责把 6 个能力 crate 接成应用。

本包有两层规范：

- **backend**（本目录）— Rust 侧：IPC 命令、配置落盘、应用装配
- **[frontend](../frontend/index.md)** — React + TypeScript 侧

## 开发前检查清单

- [ ] 读了 [Rust 通用约定](../../guides/rust-conventions.md)
- [ ] 改动跨 IPC 的类型或命令？→ **必读** [IPC 契约指南](../../guides/ipc-contract-guide.md)，前端有手写镜像
- [ ] 加业务逻辑？先问它是否该下沉到能力 crate——本 crate 只做装配与边界转换
- [ ] 动配置落盘？→ 注意 0600 权限**只在 Unix 生效**，见 [配置落盘](./config-persistence.md)

## 具体规范

| 文档 | 内容 |
|------|------|
| [IPC 命令](./ipc-commands.md) | 7 个命令清单、错误约定、流式与广播两套原语、提供商工厂 |
| [配置落盘](./config-persistence.md) | 路径解析、首次运行、权限收紧的现状与缺口 |
| [应用装配](./app-setup.md) | 启动顺序、单实例、托盘、热键注册与冲突上报、ACL |

## 职责边界

本 crate 应当很薄。当前 592 行 Rust，分工：

| 文件 | 职责 |
|------|------|
| `src/main.rs` | 6 行，只调 `lib.rs` 的 `run()` |
| `src/lib.rs` | 应用装配：插件、状态、命令注册、setup |
| `src/commands.rs` | `#[tauri::command]` 边界 + 提供商工厂 |
| `src/config.rs` | 配置文件读写 |
| `src/hotkeys.rs` | 热键注册与冲突上报 |

**新增业务逻辑先考虑放能力 crate**。判断标准：这段逻辑需要 `AppHandle` / `State` / 文件系统吗？不需要就该下沉到 `crates/*`——那里能单测，这里基本不能（见下）。

## 测试现状与缺口

现有测试都在纯函数上：

- `config.rs:66-118` — 4 个测试用 `tempfile::tempdir()` 覆盖读写往返、缺文件、坏 JSON
- `hotkeys.rs:134-180` — 3 个测试覆盖 `effect_for` 与 JSON 序列化形状
- `commands.rs:134-192` — 5 个测试，**只覆盖 `build_provider`**

真实缺口，动到这些地方要格外小心（改错了没有测试会拦住你）：

- **所有 `#[tauri::command]` 函数零测试**——凡是接收 `AppHandle` / `State` 的代码都没测
- **`restrict_permissions`（0600 逻辑）零测试**
- **无 E2E**：`tauri-driver` 层完全缺失，无 `src-tauri/tests/` 目录

## 质量检查

```bash
cargo clippy --all-targets -- -D warnings
cargo test -p lingostack-app
pnpm tauri dev      # 改了 IPC 必须实跑，这是唯一能验证往返的手段
```

## 日志

全仓库无日志框架。唯一运行时输出是 `hotkeys.rs:106` 一处 `eprintln!`。不要为单个需求引入 `tracing`——真要引入需先做技术决策，并同时处理 API Key 脱敏。

# lingostack-core 开发规范

> 纯逻辑 crate：配置模型、语言判定、热键冲突检测、Prompt 模板。**禁依赖 `tauri`，CI 强制。**

路径：`crates/lingostack-core`

## 开发前检查清单

- [ ] 读了 [Rust 通用约定](../../guides/rust-conventions.md)（错误类型、测试、serde 属性写法）
- [ ] 改的是跨 IPC 的类型？→ 必读 [IPC 契约指南](../../guides/ipc-contract-guide.md)，前端有手写镜像要同步
- [ ] 要新增的逻辑**不需要**任何系统能力（无文件 IO、无 tauri、无平台 API）？需要就该放别的 crate
- [ ] 加配置字段？→ 记住有**两份**默认值清单要同步（字段属性 + `impl Default`）
- [ ] 已按 [全仓测试策略](../../lingostack-app/backend/testing-strategy.md) 判定快速反馈与最终门禁

## 具体规范

| 文档                                     | 内容                                                |
| ---------------------------------------- | --------------------------------------------------- |
| [模块职责](./module-responsibilities.md) | 5 个模块各管什么、边界在哪、什么不该放进来          |
| [配置模型](./config-model.md)            | serde 属性选型、双份默认值、模型解析、密钥脱敏      |
| [Prompt 模板](./prompt-templates.md)     | 外置文本 + 编译期嵌入、快照守护的真实机制、改动纪律 |

## 纯净性约束

这是本 crate 唯一的硬性架构约束：

```bash
cargo tree -p lingostack-core | grep tauri   # 必须无输出
```

CI 在 ubuntu / windows / macos 三平台强制（`.github/workflows/ci.yml:58-65`），失败即红。

依赖只允许三个：`serde`、`serde_json`、`thiserror`（`Cargo.toml:10-13`）。crate 带 `#![forbid(unsafe_code)]`（`src/lib.rs:8`）。

**最可能踩雷的方向**：往本 crate 加配置文件读写。配置的磁盘 IO 已在 `src-tauri/src/config.rs`，别搬过来——会引入 `dirs` 之类依赖并埋下破坏纯净性的隐患。本 crate 只负责配置的**内存模型与序列化**。

## 质量检查

```bash
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test -p lingostack-core
cargo tree -p lingostack-core | grep tauri
```

新增公共类型 / 函数必须带测试，serde 类型必须带往返测试。

## 已知待清理

- `CRATE_NAME` 常量（`src/lib.rs:16-17`）的文档说它服务于一个 `app_info` IPC 链路自检，**但全仓库不存在 `app_info` 命令，该常量零引用**。要么补上用途，要么删掉，别照着这条注释找不存在的东西。

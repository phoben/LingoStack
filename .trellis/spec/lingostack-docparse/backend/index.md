# lingostack-docparse 开发规范

> **当前是空白占位 crate**，无任何实现。规划：Markdown / PDF（文本版）/ DOCX 提取、分块、结构骨架。设计文档定为 V1.5 实装。

路径：`crates/lingostack-docparse`

## 当前真实状态

`src/lib.rs` 全文 11 行：一段模块文档 + 一个 `assert_eq!(1 + 1, 2)` 烟雾测试。

- 无模块、无类型、无函数、无 trait
- **`Cargo.toml` 零依赖**，连 `serde` 都没有
- 已在 workspace 成员与依赖别名里声明（根 `Cargo.toml:9,28`），但 **`src-tauri/Cargo.toml` 未引用它**，全仓库无任何代码消费它

它是本仓库「workspace 依赖别名 = 实际在用」这条惯例的**唯一例外**——为 V1.5 提前声明。

前端的文档翻译视图（`src/components/views/docs-view.tsx`）目前是硬编码演示数据，与本 crate 无连接（该文件 `:65-66` 自己写明业务能力留待后续）。

## 开始实装时

本文档要随第一段真实代码一起重写。届时先做的事：

- [ ] 读 [Rust 通用约定](../../guides/rust-conventions.md)，按既有约定定错误枚举（`DocParseError`）、内联测试、serde 属性
- [ ] 判断是否需要平台差异——大概率不需要，纯解析逻辑应保持平台无关
- [ ] 在 `src-tauri/Cargo.toml` 加依赖并在 IPC 层接通，参照 [IPC 命令](../../lingostack-app/backend/ipc-commands.md)
- [ ] 删掉那个 `1 + 1` 烟雾测试，换成真实断言
- [ ] 解析器要用**真实样例文件**做测试固件，覆盖畸形输入（截断的 PDF、空 DOCX、混合编码的 Markdown）
- [ ] 新增第三方解析库要按项目约定固定版本，并评估是否引入不必要的传递依赖

## 设计取向（来自设计文档，尚未验证于代码）

- 只处理**文本版 PDF**，不做 OCR
- 输出要含结构骨架（标题层级），供文档翻译保留格式
- 分块要考虑 LLM 上下文窗口

这些是规划意图，实装时以设计文档为准，并在本文档记录实际选择。

## 质量检查

```bash
cargo clippy --all-targets -- -D warnings
cargo test -p lingostack-docparse
```

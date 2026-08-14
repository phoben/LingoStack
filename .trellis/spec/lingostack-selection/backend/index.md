# lingostack-selection 开发规范

> 系统取词。Windows 走 UI Automation，失败降级剪贴板；macOS / Linux 为占位实现。

路径：`crates/lingostack-selection`（116 + 161 + 45 + 44 行）

## 开发前检查清单

- [ ] **必读** [平台隔离指南](../../guides/platform-isolation-guide.md)——本 crate 是该模式的样板
- [ ] 读了 [Rust 通用约定](../../guides/rust-conventions.md)
- [ ] 在调用侧写平台分支了吗？不允许，走 trait + 工厂函数
- [ ] 改 Windows 原生调用？确认 COM、`unsafe`、剪贴板清理三条约定
- [ ] 动 macOS / Linux？在结论里标注「需在目标平台验证」
- [ ] 已按 [全仓测试策略](../../lingostack-app/backend/testing-strategy.md) 区分结构测试、目标平台运行与人工系统证据

## 结构

| 文件             | 内容                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/lib.rs`     | `Selection` 类型、`SelectionError`、`SelectionProvider` trait（`:30-36`）、`#[cfg]` 模块声明与工厂函数（`:55-81`）   |
| `src/windows.rs` | 唯一真实实现：UIA 取词 + 剪贴板降级                                                                                  |
| `src/macos.rs`   | 占位，返回 `SelectionError::Unsupported`。需 `AXUIElementCopyAttributeValue` 读 `kAXSelectedTextAttribute`（`:1-8`） |
| `src/linux.rs`   | 占位。需 AT-SPI / D-Bus，完善列为 V2（`:1-7`）                                                                       |

工厂函数返回 `Box<dyn SelectionProvider>`，调用侧（`src-tauri/src/commands.rs:15-20`）只认 trait。

## 两级降级

Windows 实现的核心行为，改动时必须保留：

1. **UIA 取词**：任何一步失败都返回 `None`，**丢弃全部 HRESULT 信息**（`windows.rs:76-86` 用 `.ok()?`，理由见 `:63-66`）
2. **剪贴板兜底**：这一层的失败**保留错误信息**，`SelectionError::Failed(format!("打开剪贴板失败: {e}"))`（`:97`）

两层策略刻意不同：前者后面还有兜底所以静默，后者是最后一环所以要报。**新写平台实现时默认选保留错误信息那种。**

取词失败在产品层的处理是降级为权限引导 + 剪贴板取词——不要吞掉最终错误。

## Windows 原生调用约定

- COM 初始化 `CoInitializeEx(None, COINIT_APARTMENTTHREADED)`，**忽略返回值**（`:74`）——已初始化时返回 `RPC_E_CHANGED_MODE` 属正常。全 crate 无 `CoUninitialize`
- `unsafe` 大块包裹整个函数体，上方一个 `// SAFETY:` 注释块（`:68-87`）
- 不手写 `Release`，依赖 `windows` crate 的 RAII 包装（`:69-70` 说明）
- **剪贴板必须成对清理**：`OpenClipboard` 后所有返回路径都要 `CloseClipboard`，用闭包包裹结果实现（`:99-116`，理由见 `:92-95`）；`GlobalLock`/`GlobalUnlock` 成对（`:101,110`）；`GetClipboardData` 的句柄**不释放**，系统所有

## 测试的天花板

`windows.rs:119-161` 的现有测试只能断言「不 panic / 结果自洽」——结果取决于运行环境有没有真实选中文本（`:129-132` 注释写明）。这是这类代码的固有上限，别为了「提高覆盖率」写出断言不了正确性的假测试。

占位实现都有测试，断言返回 `Unsupported`（如 `macos.rs:38-44`）。

**实装某平台时删掉占位测试并补真实测试**——否则占位测试继续通过，给出虚假信心。

## 质量检查

```bash
cargo clippy --all-targets -- -D warnings
cargo test -p lingostack-selection
```

CI 三平台矩阵都跑（`.github/workflows/ci.yml:22`），但那只验证了占位实现返回 `Unsupported`，不代表功能被验证过。

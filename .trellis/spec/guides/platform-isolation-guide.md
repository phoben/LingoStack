# 平台隔离指南

> 适用于 `lingostack-selection`、`lingostack-tts`，以及任何未来含平台差异的能力。核心规则：**调用侧不写平台分支**。

## 既定模式

`selection` 与 `tts` 用同一套写法，照抄即可（`crates/lingostack-tts/src/lib.rs:35-60`，`crates/lingostack-selection/src/lib.rs:55-81`）：

1. 一个对象安全 trait，声明 `Send + Sync`(`Speaker` 在 `tts/src/lib.rs:10-19`；`SelectionProvider` 在 `selection/src/lib.rs:30-36`)
2. `#[cfg(target_os = "...")] mod windows; mod macos; mod linux;`
3. 每个平台文件一个 struct 实现该 trait
4. 一个工厂函数用 `#[cfg]` 块返回 `Box<dyn Trait>`

```rust
#[must_use]
pub fn speaker() -> Box<dyn Speaker> {
    #[cfg(target_os = "windows")]
    { Box::new(windows::WindowsSpeaker::new()) }
    #[cfg(target_os = "macos")]
    { Box::new(macos::MacosSpeaker::new()) }
    #[cfg(target_os = "linux")]
    { Box::new(linux::LinuxSpeaker::new()) }
}
```

调用侧只认工厂函数与 trait，永远不写 `if windows/mac`。

## 占位实现的规矩

macOS / Linux 目前是占位。它们**返回类型化错误，绝不 panic、绝不静默 no-op**：

- `Err(SelectionError::Unsupported)`（`selection/src/macos.rs:29-31`、`linux.rs:27-30`）
- `Err(TtsError::Unsupported)`（`tts/src/macos.rs:27-34`、`linux.rs:26-33`）

每个占位文件必须带：

- 模块级文档说明**需要哪个系统 API**（例：`selection/src/macos.rs:1-8` 点明 `AXUIElementCopyAttributeValue` 读 `kAXSelectedTextAttribute`；`tts/src/macos.rs:1-7` 点明 `AVSpeechSynthesizer`）
- 「**待在目标平台实现与验证**」字样
- 一个断言返回 `Unsupported` 的测试（例：`selection/src/macos.rs:38-44`）

实装某平台时，删掉占位测试并补真实测试——否则占位测试会继续通过，给出虚假信心。

## `lingostack-hook` 是例外

它的模块文档（`hook/src/lib.rs:3-4`）声称按 `#[cfg(target_os)]` 分文件，**但实际没有** `windows.rs`/`macos.rs`/`linux.rs`。`accelerator.rs` 与 `tray.rs` 都是平台无关逻辑，平台差异交给 Tauri 抽象（`tray.rs:6` 说明按需再拆）。

别照着这份文档注释找不存在的文件。

## Windows 原生 API 约定

### COM 初始化

两个 crate 都用 `CoInitializeEx(None, COINIT_APARTMENTTHREADED)` 且**忽略返回值**（`selection/src/windows.rs:74`、`tts/src/windows.rs:37-41`）——已初始化时返回 `RPC_E_CHANGED_MODE` 属正常，不要去改动已有 apartment。

全仓库**没有 `CoUninitialize`**，刻意如此。

### TTS 不缓存 voice 实例

`ISpVoice` 绑定 apartment，不是 `Send+Sync`，而 `Speaker` trait 要求 `Send+Sync`。所以每次 `speak`/`stop` 重新 `CoCreateInstance`（`tts/src/windows.rs:37-41`，理由见 `:1-6`）。用户点击触发的频率下这个开销可接受。

**不要**为了「优化」把 voice 缓存进 struct——会直接违反 trait 约束。

### unsafe 与错误转换

- `unsafe` 块上方写一个 `// SAFETY:` 注释块；selection 用大块包裹整个函数体（`windows.rs:68-87`），tts 用逐调用小块（`windows.rs:56-60`、`:69-73`）。两种都可接受。
- 资源释放依赖 `windows` crate 的 RAII 包装，不手写 `Release`。
- **HRESULT 处理两侧刻意不一致**：
  - UIA 路径用 `.ok()?` 把失败转成 `None`，**丢弃全部错误信息**，交调用方降级到剪贴板（`selection/src/windows.rs:76-86`，理由见 `:63-66`）
  - 剪贴板路径与 TTS 保留信息：`.map_err(|e| ...Failed(format!("...: {e}")))`（`selection/src/windows.rs:97`、`tts/src/windows.rs:40,59,72`）

新写平台代码时**默认选保留错误信息那种**。「丢弃 HRESULT」只适用于后面还有降级路径的场景。

### 剪贴板必须成对清理

`OpenClipboard` 后所有返回路径都要 `CloseClipboard`，用闭包包裹结果实现（`selection/src/windows.rs:99-116`，理由见 `:92-95`）。`GlobalLock`/`GlobalUnlock` 成对（`:101,110`）。`GetClipboardData` 拿到的句柄**不释放**——系统所有。

## 平台能力的测试上限

含真实系统调用的测试只能断言「不 panic / 结果自洽」，无法断言功能正确——结果取决于运行环境有没有真实选中文本或音频设备（`selection/src/windows.rs:129-132` 注释写明）。

- `selection/src/windows.rs:119-161`：4 个测试，均为不 panic 级
- `tts/src/windows.rs:77-117`：含一个 `Send+Sync` 编译期断言测试（`:112-116`），值得照抄

CI 三平台矩阵都跑 `cargo test --workspace`（`.github/workflows/ci.yml:22`），所以占位实现的 `Unsupported` 测试确实在各平台执行了——但那不代表功能被验证过。

**在 Windows 开发机上改 macOS / Linux 代码，必须在结论里标注「需在目标平台验证」。**

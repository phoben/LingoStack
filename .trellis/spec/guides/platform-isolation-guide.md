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

两个 crate 都用 `CoInitializeEx(None, COINIT_APARTMENTTHREADED)` 且**忽略返回值**（`selection/src/windows.rs:74`、`tts/src/windows.rs:64-74`）——已初始化时返回 `RPC_E_CHANGED_MODE` 属正常，不要去改动已有 apartment。

全仓库**没有 `CoUninitialize`**，刻意如此。

两者的调用频次不同：selection 每次取词都初始化；TTS 的 `create_voice()` 只在专用朗读线程内调用，全进程仅一次（见下节）。

### TTS 的 voice 实例常驻专用线程

`ISpVoice` 绑定 apartment，不是 `Send+Sync`，而 `Speaker` trait 要求 `Send+Sync`——所以 `WindowsSpeaker` **不能持有** voice 实例。

但也**不能在 `speak()` 里就地创建**：朗读走 `SPF_ASYNC` 立即返回，函数返回即 drop，朗读随实例被销毁（曾导致 issue #2「点了没声音」，实测产出 46 字节静音）。

现行解法是把实例关进一条进程内单例的朗读线程，`WindowsSpeaker` 无字段、只往通道递指令（`tts/src/windows.rs:1-11` 有完整推导）。单实例同时是 `SPF_PURGEBEFORESPEAK` 生效的前提——跨实例 purge **互不打断**，已实测。

改动前先读 [`lingostack-tts` 规范](../lingostack-tts/backend/index.md) 的「关键约束」一节。**别把 voice 塞进 struct，也别为「简化」退回每次新建实例。**

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

- `selection/src/windows.rs:119-161`：现有测试均为不 panic 级
- `tts/src/windows.rs:184-286`：含一个 `Send+Sync` 编译期断言测试（`:220-223`），值得照抄；另有三条守线程模型的结构性断言（耗时上界 / 不死锁 / 线程复用），均在环境无引擎时提前返回

CI 三平台矩阵都跑 `cargo test --workspace`（`.github/workflows/ci.yml:22`），所以占位实现的 `Unsupported` 测试确实在各平台执行了——但那不代表功能被验证过。

**在 Windows 开发机上改 macOS / Linux 代码，必须在结论里标注「需在目标平台验证」。**

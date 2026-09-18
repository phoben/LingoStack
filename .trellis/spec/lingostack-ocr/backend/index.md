# lingostack-ocr 开发规范

> 本地图片 OCR 能力 crate。公共层不依赖 Tauri；平台差异只在本 crate 的 target 模块与工厂中出现。

## Scenario：单张内存图片的可取消本地识别

### 1. Scope / Trigger

- 修改 OCR 输入、平台引擎、图片限制、语言选择、取消语义或测试 fixture 时适用。
- Windows 使用 WinRT `Windows.Media.Ocr`；macOS Vision 与 Linux Tesseract 在对应目标机完成前保持明确 Unsupported。

### 2. Signatures

```rust
pub trait OcrEngine: Send + Sync {
    fn recognize(&self, input: OcrInput) -> OcrOperation;
}

pub struct OcrInput {
    pub content: Vec<u8>,
    pub format: ImageFormat,
    pub language: OcrLanguage,
}

OcrOperation::cancellation() -> OcrCancellation
OcrOperation::result(self) -> Result<OcrResult, OcrError>
```

### 3. Contracts

- 输入只在 operation 生命周期持有；不接收路径，不写文件，不记录字节。
- `ImageFormat` 只允许 PNG/JPEG/WebP，声明格式必须与魔数一致。
- Windows 先读取 decoder 元数据；像素安全后，超过 `OcrEngine::MaxImageDimension` 才等比缩小。
- 显式 zh/en/ja 只匹配已安装的 BCP-47 语言族；auto 使用用户首选语言。
- `OcrCancellation::cancel()` 幂等，并调用当前 WinRT 异步操作的 `Cancel()`；序号守卫只作为第二道防线。
- `fixture` feature 只供桌面 E2E；默认/release 依赖图不得主动启用。

### 4. Validation & Error Matrix

| 条件 | `OcrError` |
|---|---|
| 空字节 | `EmptyInput` |
| 超过 10 MiB | `InputTooLarge` |
| 声明格式不支持/魔数不符 | `UnsupportedFormat` / `FormatMismatch` |
| 宽高为零、decoder 失败 | `DecodeFailed` |
| 宽 × 高溢出或超过 40 MP | `ImageTooLarge` |
| 指定语言族未安装 | `LanguageUnavailable` |
| 输出 trim 后为空 | `NoText` |
| 任一异步阶段收到取消 | `Cancelled` |

错误展示不得包含原始图片、路径、WinRT 完整异常体或用户数据。

### 5. Good/Base/Bad Cases

- Good：4000×2000 图片在安全像素内，按系统最大边长等比缩小后识别。
- Base：小图不放大，自动语言使用用户 profile。
- Bad：为方便调用在 Tauri 层写 `cfg!(windows)` 分支，或把图片交给视觉模型/网络 OCR。

### 6. Tests Required

- 纯逻辑：三种魔数、声明不符、10 MiB 边界、40 MP、等比尺寸、对象安全。
- 平台编译：Windows feature 集必须覆盖 Foundation/Globalization/Imaging/Ocr/Cryptography/Streams，异步 future 可 Send。
- 取消：fake/fixture 与系统操作都保持 cancel handle；迟到结果由上层序号测试覆盖。
- 真实验收：Windows 断网中文/英文、缺语言包、无文字、4K、连续替换；macOS/Linux 只能在目标平台实现后声明通过。

### 7. Wrong vs Correct

```rust
// Wrong：调用侧决定平台，且取消只忽略结果。
if cfg!(windows) { /* recognize */ }

// Correct：工厂封装平台，operation 同时暴露等待结果和真实取消句柄。
let operation = lingostack_ocr::engine().recognize(input);
let cancellation = operation.cancellation();
```

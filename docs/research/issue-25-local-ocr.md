# Issue #25：翻译页本地离线图片取字方案调研

> 调研日期：2026-09-17。本文仅引用 OCR 项目官方仓库、其官方文档和操作系统厂商的一手 API 文档；不包含实施授权。发行包体积、各平台 FFI 可编译性和识别质量会随目标平台与选取语言变化，实施前必须在目标机复核。

## 结论先行

首期应把“图片取字”建模为一个**仅处理内存图片、返回 UTF-8 文本、可取消的本地能力**。图片粘贴或拖入后，先替换翻译原文框；识别成功即自动启动现有文本翻译。图片不进入 LLM 请求、不写入文档库、不保存到收藏或日志。

推荐采用**按平台隔离的 OCR trait**，而非把 OCR 接进 `lingostack-llm` 或文档导入：

| 平台 | 首选实现 | 首期产品结果 | 原因 |
| --- | --- | --- | --- |
| Windows | `Windows.Media.Ocr.OcrEngine` | 识别已安装 OCR 语言；缺语言时提示安装，不降级上传 | 系统 API 接受本地 `SoftwareBitmap`，返回文本与词/行位置；不额外捆绑模型。 |
| macOS | Apple Vision `VNRecognizeTextRequest` | 调用系统文字识别，按实际支持语言运行 | 系统框架提供语言列表、自动语言识别、速度/精度档位与取消。 |
| Linux | 随应用发行的 Tesseract 5 + 明确选取的 `tessdata_fast` | 首期至少中文简体与英文；不能依赖发行版预装包 | Linux 没有可依赖的统一桌面 OCR API；Tesseract 官方支持 Linux 与多语言离线数据。 |

这是一条“平台原生优先、Linux 自带引擎”的路线。它保持图片在本机，也避免 Windows/macOS 重复打包 OCR 模型；代价是识别结果和可用语言会随系统不同。**不能承诺三端识别质量完全一致。** 如果产品之后要求完全一致的语言集合与输出，再评估三端均打包 Tesseract；那是明显的体积、第三方依赖与许可证告知扩张，不应悄然放进本 Issue。

## 已核验能力与限制

| 方案 | 跨平台覆盖 | 语言与离线边界 | 分发体积与运行时依赖 | 许可证 | 并发与取消 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| Tesseract 5 | 官方文档给出 Linux、macOS 和 Windows 的安装路径；可用命令行或 C/C++ API。 | 语言由随引擎放置的 `.traineddata` 决定；官方有 `tessdata`、`tessdata_best`、`tessdata_fast`，可一次指定多个语言。整个识别输入是本地文件/像素与本地模型，无服务端端点或 Key。 | 引擎外还需要 Leptonica 和所选语言数据；以 `leptess` 接入时，构建机需 clang、Tesseract、Leptonica，Windows 还需 vcpkg。官方资料未给稳定的通用 MB 数，必须在每个正式安装包中实测并记入第三方声明。 | Tesseract 为 Apache-2.0；其 README 明确提示 Leptonica 采用 BSD 2-clause 类许可；`leptess` 为 MIT。 | 官方 C API 有独立 `TessBaseAPI`，源码说明多个实例大多可并行但部分全局参数例外；C API 提供取消回调与 deadline。每个请求独享实例、并发上限 1 是首期安全默认。 | 可作为 Linux 的可发行方案，也可作为未来统一后端；不建议本期在 Windows/macOS 先打包。 |
| Windows `OcrEngine` | 仅 Windows。 | `AvailableRecognizerLanguages` 读取设备可用语言，`TryCreateFromUserProfileLanguages` 会按用户语言尝试创建；微软的文字提取工具文档说明 OCR 语言包未安装就不可识别，并给出了查询/安装系统语言包的方式。API 只接收本地位图，文档没有要求网络或凭据；“离线”应在断网验收中实测确认。 | 使用操作系统提供的 WinRT 能力，不随 LingoStack 额外捆绑 OCR 二进制或模型；代价是语言包是用户系统状态，企业策略可能阻止安装。 | 系统 API；不引入随应用再分发的 OCR 开源许可。 | `RecognizeAsync` 返回 WinRT 异步操作，`IAsyncInfo.Cancel` 可取消该异步操作。仍需用请求序号拦截迟到结果，避免已取消任务覆盖新输入。 | Windows 首选；缺语言必须给出可操作提示，而非假装识别成功。 |
| Apple Vision `VNRecognizeTextRequest` | 仅 Apple 平台。 | Apple 官方文字识别说明将 Vision 定义为在用户设备上处理、覆盖实时与离线场景；可查询支持语言，指定优先语言或让框架自动检测；可选择速度或精度优先。中文不能默认开启语言校正：官方说明语言校正及 `customWords` 不支持中文。 | 随系统 Vision 框架提供，不额外发行模型；实际可用语言和算法 revision 由运行系统决定。 | 系统框架；不引入随应用再分发的 OCR 开源许可。 | `VNRecognizeTextRequest` 实现进度协议，父类 `VNRequest` 有 `cancel()`；UI 层仍须以请求序号丢弃迟到回调。 | macOS 首选，但只能在 macOS 目标机验证 FFI、沙盒权限、格式转换与语言表现。 |

### 一手来源

- [Tesseract 官方用户手册](https://github.com/tesseract-ocr/tessdoc)：Apache-2.0、API/命令行、多语言与官方训练数据仓库。
- [Tesseract 官方安装说明](https://github.com/tesseract-ocr/tessdoc/blob/main/Installation.md)：引擎与语言数据是两部分；Linux 发行版包及 130+ 语言/35+ 脚本包；Windows/macOS 安装路径。
- [Tesseract 官方命令行与多语言说明](https://github.com/tesseract-ocr/tessdoc/blob/main/Command-Line-Usage.md)：`-l eng+deu` 等多语言组合，以及语言顺序会影响耗时和输出。
- [Tesseract 官方 C API](https://github.com/tesseract-ocr/tesseract/blob/main/include/tesseract/capi.h)：`TessBaseAPI` 生命周期、取消函数、进度函数与 deadline。
- [Tesseract 官方 C++ API](https://github.com/tesseract-ocr/tesseract/blob/main/include/tesseract/baseapi.h)：多实例并发的限制与全局参数例外。
- [Tesseract 官方 README 许可证说明](https://github.com/tesseract-ocr/tesseract/blob/main/README.md)：Apache-2.0 与 Leptonica 依赖的 BSD 2-clause 类许可。
- [`leptess` 官方仓库](https://github.com/houqp/leptess)：Rust 包装层、MIT 许可、Linux/macOS/Windows 的构建依赖与 vcpkg 要求。
- [Windows `OcrEngine` 官方 API](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine)：本地位图识别、结果文本/位置、可用语言和最大图像维度。
- [Windows OCR 语言包官方说明](https://learn.microsoft.com/en-us/windows/powertoys/text-extractor)：已安装语言包限制、查询和安装方式。
- [WinRT `IAsyncInfo.Cancel` 官方 API](https://learn.microsoft.com/en-us/uwp/api/windows.foundation.iasyncinfo.cancel)：取消异步操作。
- [Apple Vision 文字识别官方 API](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)：语言、自动检测、速度/精度和支持 revision。
- [Apple Vision 识别图中文字官方指南](https://developer.apple.com/documentation/vision/recognizing-text-in-images)：在设备上处理、离线场景与中文语言校正限制。
- [Apple Vision 请求取消官方 API](https://developer.apple.com/documentation/vision/vnrequest/cancel%28%29)：取消尚未完成的请求。
- [Apple Vision 进度协议官方 API](https://developer.apple.com/documentation/vision/vnrequestprogressproviding)：文字识别请求可报告进度，回调可能发生在不同队列。

## Tesseract 的 Rust 接入取舍

`leptess` 是当前可核验的 Rust 包装层，调用形状是创建 `LepTess`、设置图像、读取 UTF-8 文本；它不是 Tesseract 官方维护的 crate。它的 README 明确要求链接现有 Tesseract 和 Leptonica：Linux 用开发包，macOS 用 Homebrew，Windows 用 vcpkg。因此它适合作为“项目编译/打包时自带原生库”的集成点，**不适合**让用户自行安装依赖后才可使用的桌面功能。

若实施 Linux Tesseract，建议：

1. 在独立 `lingostack-ocr` crate 定义纯 Rust `OcrEngine` trait 和输入/错误模型；平台实现由 `cfg(target_os)` 文件选择，调用侧没有 `if windows/mac`。
2. Linux 实现封装一个工作线程和独享 Tesseract 实例；输入只传已解码的有限尺寸位图或临时受控文件，完成后即删除临时文件。首期只接收一张图片，并限制解码后像素数量，防止压缩炸弹耗尽内存。
3. 发行 `chi_sim`、`eng` 和必要方向检测数据的最小组合；语言数据按功能可见地列出，不通过网络下载。Tesseract 官方说明语言顺序会影响耗时和输出，所以固定默认顺序并让后续设置页显式选择。
4. 将 Tesseract、Leptonica、`leptess` 和实际带入的训练数据许可证列入 `THIRD_PARTY_NOTICES`；每个目标三元组的二进制、动态库与数据体积以 CI 构建产物为准，不在设计阶段虚报 MB 数。

## 首期行为合约

| 事件 | 面向用户的可观察结果 | 后端边界 |
| --- | --- | --- |
| 粘贴或拖入一张 PNG/JPEG/WebP 图片 | 原文框显示“正在识别”；完成后**替换**原文，随即开始自动翻译。 | 浏览器侧只把图片字节交给本地 OCR IPC；LLM 只接收 OCR 后文本。 |
| 已有 OCR 或翻译正在运行时再选图 | 取消旧识别/翻译；旧结果不得覆盖新图片文本。 | 每次操作建立递增请求号；取消底层请求并在 UI/IPC 两侧拒绝迟到结果。 |
| 选择多张图片 | 明确提示“首期一次仅支持一张图片”，不静默只取第一张。 | 不开始 OCR。 |
| 图片太大、格式不支持、系统缺语言或没有文字 | 原文保持上次稳定值，显示可操作原因；不自动调用 LLM。 | 限制在解码前后都执行；错误不包含图片路径、原始字节或 API Key。 |
| 用户切换页面 | OCR 仍由独立任务状态管理，可取消且不会污染文档记录。 | 不使用 `lingostack-document` 的 SQLite 生命周期，也不写入收藏。 |

这里“自动翻译”不表示绕过人工选择模型：仍沿用现有翻译功能的已选 Provider/模型与失败呈现。OCR 为空、取消或失败必须不发起聊天请求。

## 推荐实施顺序与验收

1. 先完成与 UI 无关的 OCR trait、输入限制、取消语义和 mock/假实现测试；确保图片字节没有进入 LLM 请求、日志、配置或 SQLite。
2. 完成 Windows `OcrEngine` 实现，覆盖已装语言、缺语言、取消、尺寸超限、无文本和连续两次选图的测试；在断网 Windows 11 实机验证中文简体/英文各一张截图。
3. 并行保持 macOS/Linux 为明确的“暂不可用”状态，直到目标机验收通过；不能把 Windows 成功写成跨平台成功。
4. macOS：在真实 macOS 目标机验证 Vision FFI/签名、PNG/JPEG/WebP 解码、中文简体/英文、取消和切页迟到结果。Linux：在至少一个发行版实际打包并验证 Tesseract/Leptonica 动态库解析、`chi_sim+eng` 数据、无网络运行、取消、体积和第三方告知。
5. 三端通过后，增加前端 Vitest（粘贴、拖放、多图拒绝、替换原文、自动翻译）、Rust 单测（限制/取消/错误映射）和受控图像 fixture 集成测试；OCR 正确率不应只以“有输出”判定，需准备中英代码截图、浏览器文本、低清晰度截图的人工基准。

## 不纳入 #25 的范围

- 扫描 PDF、DOCX 或其他文档的 OCR；它们属于既有文档翻译 V2 路线，需要单独处理分页、持久化和进度。
- 图片直接发送给视觉模型、多模态 Provider 能力选择或网络 OCR 服务；这会改变 BYOK、隐私和 LLM 协议边界。
- 图片历史、图片收藏、OCR 文本校对编辑器和多图批处理。
- 任意平台自动下载安装语言包；首次只检测并引导用户安装（Windows）或将 Linux 所需数据随包发布。

## 尚待目标机验证的结论

Windows 当前是本机开发环境，可验证 WinRT 调用；但真实企业设备的语言包策略仍需覆盖。macOS 与 Linux 在本机无法实跑，以下均为实施验收项而非已完成事实：Apple Vision 的 Rust FFI/签名与语言表现、Linux 各发行版的动态库加载、Tesseract 打包体积、`chi_sim+eng` 质量、断网状态、取消延迟和资源占用。

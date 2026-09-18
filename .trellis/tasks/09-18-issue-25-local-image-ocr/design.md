# Issue 25 跨平台设计

## Architecture

图片取字是独立系统能力，不进入 `lingostack-llm`、`lingostack-docparse` 或 `lingostack-document`。新增 `lingostack-ocr` crate，沿用 selection/tts 的平台隔离模式：公共 trait、公共输入/错误模型、按 `target_os` 分文件的实现和单一工厂；调用侧只认公共接口。

```text
翻译页 paste/drop
  -> ocr-store（仅任务元数据，不保存图片）
  -> src/lib/ipc.ts
  -> Tauri OCR command + 取消注册表
  -> lingostack-ocr 平台实现
  -> UTF-8 文本
  -> stream-store 现有翻译链路
  -> LLM 只接收文本
```

所有平台共享相同隐私、限制、取消和迟到结果规则；识别引擎与发行依赖按平台隔离。

## Platform choices

| 平台 | 实现 | 开放门槛 |
| --- | --- | --- |
| Windows | WinRT `Windows.Media.Ocr.OcrEngine` + `Windows.Graphics.Imaging` 内存解码 | Windows 11 断网、中文/英文、取消、语言缺失和实际安装包通过 |
| macOS | Vision `VNRecognizeTextRequest` | macOS 目标机完成 FFI、签名/沙盒、语言、取消和离线验证 |
| Linux | Tesseract 5 + Leptonica + `tessdata_fast` 的 `chi_sim`/`eng` | 至少一个目标发行版完成随包动态库、语言数据、许可、离线和质量验证 |

未达开放门槛的平台返回类型化 `Unsupported`，不降级上传、不伪装成功。

## Shared invariants

- IPC 不接收路径或文件名，只接收请求 ID、声明格式、语言提示和字节。
- 图片字节只存在于当前请求内存；Zustand 仅保存状态、序号、请求 ID 和错误文本。
- 每个请求最多一张图片；格式与体积在前端快速检查，Rust 边界再次按真实字节和解码结果检查。
- OCR 成功必须得到非空 UTF-8 文本；空文本是显式错误，不进入翻译。
- 每个平台并发上限为 1；新请求取消旧请求。
- 后端取消与前端序号守卫同时存在，任何一层都不能单独充当完整取消。
- 错误统一转成用户可操作的中文字符串到 IPC；平台错误不得携带原图或路径。

## Delivery gates

父任务不直接承载功能代码。三个子任务分别完成实现与目标平台验收；父任务只在三者均满足验收、默认分支包含变更且远端交付获授权后进入收尾。Windows 子任务完成后保持 Issue 开放，并明确 macOS/Linux 仍待验收。

## Compatibility and rollback

- 现有纯文本翻译、划词翻译、命名、文档导入和收藏协议保持不变。
- 新 OCR 命令和聊天取消命令是增量 IPC；生产 capability 无需为自定义命令扩权。
- 任一平台实现无法满足离线/取消/打包门槛时，回滚为该平台 `Unsupported`，不回滚已验证平台，也不引入网络兜底。
- Linux 引入原生库前必须先证明 CI/发行装配与第三方声明可重复；失败时停止在子任务，不污染 Windows/macOS 产物。

# Issue 25 macOS Vision OCR

## Goal

在真实 macOS 目标机上用 Apple Vision 完成与 Issue 25 公共合约一致的本地图片取字，并在签名、沙盒、语言、取消和离线验收通过后开放。

## Requirements

- 复用 `lingostack-ocr` 公共输入、错误、取消和隐私合约，调用侧不增加平台分支。
- 使用 `VNRecognizeTextRequest`，按系统实际支持语言运行；中文不得默认启用官方不支持的语言校正。
- 支持 PNG/JPEG/WebP 内存输入、单请求并发、底层 `cancel()` 与前端迟到守卫。
- 未通过目标平台验收前返回明确不可用，不以 Windows 或编译成功代替运行证据。

## Acceptance criteria

- [ ] 真实 macOS 应用签名/沙盒环境下中英文图片离线识别通过。
- [ ] 取消、连续选图、切页、格式错误、无文字和语言不支持场景通过。
- [ ] 自动化、目标机运行和人工质量证据分别记录。

## Out of scope

- Windows/Linux 实现、网络 OCR、三平台逐字一致性。

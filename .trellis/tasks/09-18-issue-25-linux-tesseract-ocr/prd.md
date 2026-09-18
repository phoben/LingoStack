# Issue 25 Linux Tesseract OCR

## Goal

在目标 Linux 发行版中随 LingoStack 发行 Tesseract 5、Leptonica 与中英文语言数据，完成无需系统预装、无需联网的本地图片取字。

## Requirements

- 复用 `lingostack-ocr` 公共输入、错误、取消和隐私合约，调用侧不增加平台分支。
- 随应用带入经验证的 Tesseract/Leptonica、`tessdata_fast` 的 `chi_sim`/`eng` 及必要方向数据，不允许运行时下载。
- 单工作线程、独享引擎实例、并发上限 1；底层取消与 deadline 必须真实生效。
- 将全部原生库、Rust 包装层和训练数据许可证纳入生成的 `THIRD_PARTY_NOTICES`。
- 未通过目标发行版打包、动态库、离线、质量和体积验收前保持能力不可用。

## Acceptance criteria

- [ ] 至少一个目标发行版的正式产物在无系统 Tesseract、无网络环境下识别中英文图片。
- [ ] 动态库、语言数据、取消、连续选图、格式/尺寸错误和无文字场景通过。
- [ ] 安装包体积与第三方许可基于真实产物记录，无估算冒充。

## Out of scope

- Windows/macOS 实现、运行时下载语言包、网络 OCR。

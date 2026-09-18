# Issue 25 执行路线

## Stage 1: Windows 首发

- [ ] 完成 `09-18-issue-25-windows-ocr` 的设计评审并单独激活该子任务。
- [ ] 实现通用 OCR 合约、真实 OCR/翻译取消、Windows WinRT OCR 和翻译页交互。
- [ ] 完成自动化、真实 Tauri 往返、Windows 断网与语言包场景验收。
- [ ] 交付时明确 macOS/Linux 尚未完成，不关闭 Issue 25。

## Stage 2: macOS

- [ ] 在可用 macOS 目标机上重新核对 Vision API、最低系统版本、签名与沙盒边界。
- [ ] 规划并实施 `09-18-issue-25-macos-vision-ocr`；Windows 环境不得代写运行通过结论。
- [ ] 验证 PNG/JPEG/WebP、中文/英文、取消、切页迟到结果、断网和真实应用签名。

## Stage 3: Linux

- [ ] 在目标发行版上确定 Tesseract/Leptonica 的静态或动态发行方式及可重复构建方案。
- [ ] 规划并实施 `09-18-issue-25-linux-tesseract-ocr`，随包带入 `chi_sim`、`eng` 和必要方向数据。
- [ ] 生成并核对 `THIRD_PARTY_NOTICES`，实测安装包体积、动态库解析、离线、取消与质量基准。

## Final integration and delivery

- [ ] 在三平台分别记录自动化与人工系统证据，不能用 CI 编译替代 OCR 识别质量。
- [ ] 复核图片字节未进入 LLM、SQLite、IndexedDB、配置、日志或错误。
- [ ] 完成父任务跨平台验收清单与最终回归。
- [ ] 本地提交使用 `Refs #25`；push、PR、Issue 评论、标签或关闭分别取得明确授权并回读。

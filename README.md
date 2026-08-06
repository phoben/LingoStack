# LingoStack · 译栈

> A lightweight, minimal, modern cross-platform desktop translator for non-native English programmers.
> 一款面向非英语母语程序员的轻量、简洁、现代的跨平台桌面翻译工具。

**状态：📋 设计阶段（设计已确认，待实施）** — 本仓库目前仅含设计文档，尚无可运行代码。

## ✨ 特性（规划中）

- **划词翻译** — 在任意应用中选中文本即弹出 PopClip 式动作条（翻译 / 解释 / 朗读 / 收藏 / 复制）
- **文本翻译** — 流式渲染，支持源/目标语言映射
- **变量名生成** — 由中文描述生成 `camelCase` / `snake_case` / `PascalCase` 候选
- **词条解释** — 词义、词性、例句与开发语境用法
- **文档翻译** — Markdown / PDF / DOCX 双栏对照阅读（V1.5）
- **收藏管理** — 搜索、分组、JSON 导入导出
- **多 LLM 提供商** — OpenAI 兼容 / Anthropic / Gemini / Ollama，自带 Key，零订阅零内置计费
- **隐私透明** — 零遥测，所有请求直连你自行配置的提供商

## 🛠 技术栈

| 层 | 选型 |
|----|------|
| 框架 | Tauri 2（Rust + 系统 WebView） |
| 前端 | React 18 · TypeScript · Tailwind CSS · shadcn/ui · Zustand |
| 后端 | Rust workspace（取词 / 热键 / TTS / 文档解析 / LLM 适配） |
| 平台 | Windows · macOS · Linux |

## 📐 设计文档

完整产品设计见 [`docs/2026-08-06-lingostack-design.md`](docs/2026-08-06-lingostack-design.md)。

## 🗺 路线图

- **V1（MVP）** — 划词翻译、文本翻译、变量名生成、解释朗读、收藏、托盘与全局热键（含冲突检测）、多 LLM 配置、明暗主题、测试与 CI/CD 基建
- **V1.5** — 文档翻译与对照阅读、社区 i18n 贡献
- **V2** — PDF 扫描版 OCR、WebDAV 同步

## 🔒 隐私

LingoStack **不收集**任何遥测、统计或崩溃数据。所有 LLM 请求直接发送到你自行配置的提供商，工具本身不经过任何中间服务器。崩溃问题由用户手动通过 GitHub Issue 上报（日志中不记录 API Key）。

## 🤝 贡献

MIT 开源项目。贡献规范（`CONTRIBUTING.md`）、Issue / PR 模板、DCO 检查等将在 V1 实施阶段建立，详见设计文档 §11。

## 📄 许可证

[MIT License](LICENSE) · Copyright © 2026 夏超

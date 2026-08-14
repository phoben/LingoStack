<p align="center">
  <img src="src-tauri/icons/icon.png" width="120" height="120" alt="LingoStack logo" />
</p>

<h1 align="center">LingoStack · 译栈</h1>

<p align="center">
  <em>A lightweight, minimal, modern cross-platform desktop translator<br>for non-native English programmers.</em><br>
  一款面向非英语母语程序员的轻量、简洁、现代的跨平台桌面翻译工具。
</p>

<p align="center">
  <a href="https://github.com/phoben/LingoStack/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/phoben/LingoStack/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/phoben/LingoStack/actions/workflows/dco.yml"><img alt="DCO" src="https://github.com/phoben/LingoStack/actions/workflows/dco.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2.0-orange">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-dea584">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6">
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey">
</p>

---

## 简介

**LingoStack（译栈）** 是一款常驻系统的桌面翻译工具，专为非英语母语的程序员设计。核心场景是**划词翻译**与**写作输出辅助**——在任意应用中选中文本，即可获得符合「开发行业语言」的专业翻译：避让产品名、变量名、命令名、技术名词，**不做机械直译**（不会把 Redis 译成「远程字典服务」）。

除了划词翻译，它还提供文本翻译、变量名生成、词条解释、朗读、收藏管理与文档翻译等能力。

**为什么选择 LingoStack？**

- 🔑 **自带 LLM Key，零订阅、零内置计费** —— 支持 OpenAI 兼容协议（覆盖 DeepSeek / 通义 / 智谱 / Ollama）、Anthropic、Gemini
- 🔒 **隐私透明，零遥测** —— 所有请求直连你自行配置的提供商，工具本身不经过任何中间服务器
- ⚡ **轻量原生** —— 基于 Tauri 2（Rust + 系统 WebView），安装包约 10 MB，内存占用低
- 💸 **完全开源** —— MIT 协议，接受社区贡献

> 📋 **项目状态：V0 脚手架已就绪，核心功能开发中。**
> 当前主干已交付可编译、可运行、可测试的工程骨架（Rust workspace + Tauri 2 前端 + CI 全绿），但**尚未实现任何业务功能**。划词翻译等能力将在 V1 落地。欢迎 ⭐ Star 关注进展，或参与贡献。

## ✨ 特性路线

|  状态   | 特性                                 | 说明                                                                                  |
| :-----: | ------------------------------------ | ------------------------------------------------------------------------------------- |
|  🚧 V1  | **划词翻译**                         | 任意应用选中文本 → PopClip 式动作条（翻译 / 解释 / 朗读 / 收藏 / 复制）→ 流式译文浮窗 |
|  🚧 V1  | **文本翻译**                         | 主窗口翻译标签页，流式渲染，源 / 目标语言映射                                         |
|  🚧 V1  | **变量名生成**                       | 中文描述 → `camelCase` / `snake_case` / `PascalCase` 候选                             |
|  🚧 V1  | **词条解释**                         | 词义、词性、例句、开发语境用法                                                        |
|  🚧 V1  | **收藏管理**                         | 搜索、分组、JSON 导入导出                                                             |
|  🚧 V1  | **多 LLM 配置**                      | 多提供商并存、按功能指定默认模型、全局兜底                                            |
|  🚧 V1  | **托盘 + 全局热键**                  | 系统托盘常驻、自定义热键、冲突检测                                                    |
| 📋 V1.5 | **文档翻译**                         | Markdown / PDF / DOCX 双栏对照阅读 + 导出                                             |
|  📋 V2  | **PDF 扫描版 OCR** / **WebDAV 同步** |                                                                                       |

完整产品设计见 [`docs/lingostack-design.md`](docs/lingostack-design.md)。

## 🛠 技术栈

| 层   | 选型                                                                         |
| ---- | ---------------------------------------------------------------------------- |
| 框架 | [Tauri 2](https://tauri.app)（Rust 后端 + 系统 WebView 前端）                |
| 前端 | React 18 · TypeScript（严格模式）· Vite · Tailwind CSS · shadcn/ui · Zustand |
| 后端 | Rust（Cargo workspace，多 crate）                                            |
| 平台 | Windows · macOS · Linux                                                      |

## 🚀 快速开始

### 环境要求

| 依赖                               | 版本   | 说明                                                    |
| ---------------------------------- | ------ | ------------------------------------------------------- |
| [Node.js](https://nodejs.org/)     | ≥ 20   | 前端运行时                                              |
| [pnpm](https://pnpm.io/)           | ≥ 10   | 包管理器（`corepack enable` 启用）                      |
| [Rust](https://www.rust-lang.org/) | stable | 经 [rustup](https://rustup.rs) 安装；仓库已固定 channel |

**平台原生依赖**（Tauri 构建所需）：

- **Windows**：[Visual Studio C++ Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（勾选「使用 C++ 的桌面开发」）+ WebView2（Win11 预装）
- **macOS**：Xcode Command Line Tools（`xcode-select --install`）
- **Linux**：`libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`patchelf` 等，详见 [Tauri Linux 前置依赖](https://v2.tauri.app/start/prerequisites/)

### 从源码运行（开发者）

```bash
git clone https://github.com/phoben/LingoStack.git
cd LingoStack
pnpm install          # 安装前端依赖
pnpm tauri dev        # 启动开发：Vite + Rust + 主窗口（首次编译约数分钟）
```

### 下载预编译版

📋 预编译安装包（Windows NSIS/MSI · macOS dmg · Linux deb/AppImage）将在 **V1 发布**时提供于 [Releases](https://github.com/phoben/LingoStack/releases)。在此之前请从源码构建。

## 💻 开发指南

### 常用命令

```bash
# 开发
pnpm tauri dev                 # ★ 一键启动（Vite + Rust + 主窗口，热重载）
pnpm dev                       # 仅前端（浏览器预览 UI，不启 Rust）

# 测试
pnpm test                      # 前端单元测试（Vitest + jsdom）
pnpm test:e2e                  # 真实 Tauri 主窗口 E2E（无 API Key / 外网）
pnpm test:production-isolation # 验证 WDIO 不会进入生产构建
cargo test --workspace         # Rust 全 workspace 测试
cargo test -p lingostack-core  # 单个 crate 测试

# 提交前门禁（建议每次提交前全跑）
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
pnpm lint
pnpm test
pnpm build                     # tsc 类型检查 + Vite 打包

# 打包
pnpm tauri build               # 生成各平台安装包
```

桌面 E2E 的依赖、诊断工件、CI 行为、生产隔离与 Windows 系统级手工验收边界见 [自动化测试文档](docs/testing.md)。

### 项目结构

```
LingoStack/
├── src/                     # 前端源码（React + TS）
├── src-tauri/               # Tauri 入口 crate（package.name = "lingostack-app"）
│   ├── tauri.conf.json      # 仅主窗口配置（V1 再加浮窗/工具栏/文档阅读器）
│   └── capabilities/        # Tauri 2 ACL 权限声明
├── crates/                  # Rust workspace（纯后端能力）
│   ├── lingostack-core/     # 配置模型、语言判定、热键冲突检测（纯逻辑，禁依赖 tauri）
│   ├── lingostack-llm/      # LLM 适配层：LlmProvider trait + chat_stream()
│   ├── lingostack-selection/# 系统取词（Win UIA / macOS Accessibility / Linux AT-SPI）
│   ├── lingostack-hook/     # 全局热键、托盘、单实例锁
│   ├── lingostack-tts/      # 系统 TTS
│   └── lingostack-docparse/ # Markdown / PDF / DOCX 解析、分块
├── docs/                    # 设计文档
└── .github/                 # CI / Dependabot
```

> `lingostack-core` 保持纯净（不依赖 tauri），CI 会强制校验。平台差异（取词 / 热键 / TTS）用 trait 抽象 + 按 `#[cfg(target_os)]` 分文件隔离。

## 🗺 路线图

- **V0 — 脚手架** ✅ — Rust workspace、Tauri 2 前端、工具链与 CI 骨架；`pnpm tauri dev` 可启动空白主窗口
- **V1 — MVP** 🚧 — 划词翻译、文本翻译、变量名生成、解释朗读、收藏、托盘与全局热键（含冲突检测）、多 LLM 配置、明暗主题、测试与 CI/CD 基建
- **V1.5** 📋 — 文档翻译与对照阅读、社区 i18n 贡献
- **V2** 📋 — PDF 扫描版 OCR、WebDAV 同步

## 🤝 贡献

欢迎贡献！在提交 Pull Request 前，请：

1. 跑通上文「提交前门禁」全部命令，确保零警告、测试全绿
2. 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范（`feat:` / `fix:` / `chore:` / `docs:` 等，可附中文描述）
3. **每个 commit 必须包含 `Signed-off-by` 行**（`git commit -s`），以满足 [DCO](https://developercertificate.org/) —— CI 会自动检查

> 完整贡献规范（`CONTRIBUTING.md`）、Issue / PR 模板将在 V1 开源治理阶段建立，详见设计文档 §11。

## 🔒 隐私

LingoStack **不收集任何遥测、统计或崩溃数据**。

- 所有 LLM 请求直接发送到**你自行配置**的提供商，工具本身不经过任何中间服务器
- API Key 仅存于本地配置文件（权限 `0600`），**绝不进入日志、崩溃报告或任何上传内容**
- 崩溃问题由用户手动通过 GitHub Issue 上报

## 📄 许可证

[MIT License](LICENSE) · Copyright © 2026 夏超

本项目尊重第三方依赖许可证，发布产物将附带 `THIRD_PARTY_NOTICES`（由 CI 从 `Cargo.lock` / `pnpm-lock.yaml` 自动生成）。

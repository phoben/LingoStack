# CLAUDE.md

本文件为 Claude Code 在本仓库工作时的核心约定。**完整产品设计以设计文档为准**：[`docs/lingostack-design.md`](docs/lingostack-design.md)。任何与设计文档冲突之处，以设计文档为准并修订本文件。

## 项目概况

**LingoStack（译栈）** — 面向程序员的跨平台桌面翻译工具。Tauri 2 应用，核心场景：划词翻译、文本翻译、变量名生成、词条解释、收藏管理、文档翻译。MIT 开源、零遥测、用户自带 LLM Key。

**当前状态：V0 脚手架已就绪。** 7 crate workspace + Tauri 2 前端 + 工具链 / CI 全部初始化完成，门禁（fmt / clippy / test / lint）全绿，`pnpm tauri dev` 可启动主窗口占位界面。下一步进入 V1（业务 MVP）。

## 仓库布局（目标结构，搭建脚手架时遵循）

> **结构说明**：`lingostack-app` 是 Tauri 入口 crate。因 Tauri 2 CLI 约定——Tauri 的 Rust 代码与 `tauri.conf.json` 必须位于 `src-tauri/` 目录——其物理路径为 `src-tauri/`，仅在 `Cargo.toml` 中以 `package.name = "lingostack-app"` 体现包名。前端工程根为仓库根（`package.json` 在根），符合 Vite + Tauri 2 惯例。包层面共 **7 个 crate**（`crates/*` 六个 + `src-tauri` 一个）。

```
package.json / vite.config.ts / tsconfig.json / tailwind.config.ts / index.html
                                # 前端工程根（Vite + React 18 + TypeScript 严格模式）
src/                            # 前端源码（窗口入口 / 组件 components / hooks / stores / lib）
Cargo.toml                      # workspace 根；members = ["crates/*", "src-tauri"]
src-tauri/                      # Tauri 入口 crate（package.name = "lingostack-app"）
  tauri.conf.json               #   仅主窗口（翻译浮窗 / 划词工具栏 / 文档阅读器留待 V1）
  Cargo.toml                    #   依赖 tauri + 其余 6 个 crate（仓库内唯一依赖 tauri 的 crate）
  build.rs
  src/{main.rs, lib.rs}         #   注册空 IPC command（V0 占位）
  capabilities/default.json     #   Tauri 2 ACL 权限声明
crates/                         # Rust workspace（纯后端能力，跨平台 / 分平台）
  lingostack-core/              #   配置模型、语言判定、事件总线、热键冲突检测（纯 Rust，禁依赖 tauri，CI 校验）
  lingostack-llm/               #   LLM 适配层：LlmProvider trait + chat_stream()（OpenAI 兼容 / Anthropic / Gemini / Ollama）
  lingostack-selection/         #   系统取词（Win UIA / macOS Accessibility / Linux AT-SPI，按 target 分文件）
  lingostack-hook/              #   全局热键、托盘、单实例锁
  lingostack-tts/               #   系统 TTS（Windows tts crate / macOS AVSpeechSynthesizer）
  lingostack-docparse/          #   Markdown / PDF(文本版) / DOCX 提取、分块、结构骨架
docs/                           # 设计文档
.github/                        # CI / Dependabot / Issue 与 PR 模板
```

> **平台隔离原则**：`lingostack-selection` / `lingostack-hook` / `lingostack-tts` 等含平台差异的 crate，用 trait 抽象 + 按 `#[cfg(target_os = "...")]` 分文件隔离，禁止在调用侧写 `if windows/mac` 分支。
>
> 与现实对齐：当修改的项目结构或新增新的目录，要及时更新CLAUDE.md中的仓库布局章节

## 核心开发规范

### Rust 后端

- `**lingostack-core` 必须保持纯净**：不依赖 `tauri`，仅含可单测的纯逻辑（配置序列化、语言判定、热键冲突检测、Prompt 构建）。需要系统能力的逻辑放到对应专用 crate。
- **平台差异用 trait 抽象、按 target 分文件隔离**：取词、热键、TTS 等分平台实现，禁止在调用侧写 `if windows/mac` 分支。
- **LLM 适配只暴露 `LlmProvider` trait**：`chat_stream()` 返回 SSE 流；功能层（翻译/命名/解释/文档翻译）只认 trait，禁止直连具体提供商。
- **配置读写落在 Rust 侧**：应用配置用 JSON 文件（`dirs` crate 取跨平台配置目录），Rust 直接读写，避免 IPC 往返。配置文件权限 `0600`。
- **零遥测**：不引入任何统计/崩溃上报依赖。

### 前端

- **多窗口架构**：主窗口、翻译浮窗、划词工具栏、文档阅读器各自独立生命周期（见设计文档 §4.3）；窗口间通信走 Tauri events。
- **状态管理统一用 Zustand**；收藏数据存 IndexedDB（仅 UI 层消费）。
- **设计先行：先查原型**：在设计任何组件、页面、样式之前，必须先调用 `/lingostack-design` 技能熟悉项目既有的设计规范与原型稿，并优先按原型实现；原型未覆盖的场景才自行设计，且须与已有视觉规范保持一致。
- **样式用 Tailwind + shadcn/ui**，遵循设计文档 §12 的视觉规范：中性灰蓝、单一蓝色强调色（`#2563eb` / `#3b82f6`）、圆角 10–14px、明暗主题+跟随系统。
- **新增组件默认走 shadcn/ui**，避免手写重复样式。

### 翻译质量（产品差异化核心）

- 翻译/命名/解释的 Prompt 与逻辑必须遵循**开发行业语言**：避让产品名、变量名、命令名、技术名词，**避免直译**（如不把 "Redis" 译成"远程字典服务"）。
- 所有内置 Prompt 模板须有**快照测试**，防止无意改动导致风格回归。用户自定义 Prompt 留空时才回退到内置。

### 安全与密钥

- **API Key 绝不进日志、崩溃报告、Issue 模板或任何上传内容。** 日志记录前对敏感字段脱敏。
- 集成测试只用 mock HTTP server（`wiremock`），CI 中不使用真实密钥。

### 错误处理

不吞错。LLM 请求超时/5xx 自动重试 1 次（指数退避）；429 显示等待并降并发；取词失败降级为权限引导 + 剪贴板取词；热键注册失败即报冲突；流式中断保留已渲染部分并提供「重试」。详见设计文档 §9。

## 质量门禁

- **Rust**：`cargo fmt` + `cargo clippy`（`-D warnings`，零警告）必须通过。
- **前端**：ESLint 无报错；TypeScript 严格模式，禁止 `any` 滥用。
- **测试要求**：新功能必须带测试。四层策略见设计文档 §10（Rust 单测 / LLM mock 集成测试 / Vitest 前端测试 / tauri-driver E2E）。
- **提交规范**：遵循 Conventional Commits（`feat:` / `fix:` / `chore:` / `docs:` 等，可附中文描述）。DCO 要求每个 commit 含 `Signed-off-by`。

## 常用命令

```bash
# 前端
pnpm install
pnpm dev               # Vite dev server（http://localhost:1420）
pnpm lint              # eslint --max-warnings 0
pnpm test              # vitest run
pnpm build             # tsc --noEmit + vite build（生成 dist/）

# Rust（workspace）
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
cargo test -p lingostack-core              # 单 crate 测试
cargo tree -p lingostack-core | grep tauri # core 纯净性自检（应无输出）

# Tauri（端到端）
pnpm tauri dev          # 启动开发：vite + Rust + 主窗口
pnpm tauri build        # 打包发布产物
```

> Windows 开发机需安装 **MSVC Build Tools**（"Build Tools for Visual Studio 2022" + 「使用 C++ 的桌面开发」工作负载）。`rust-toolchain.toml` 固定 `stable`，本机解析到 `x86_64-pc-windows-msvc`。

## 开发环境注意

- 主开发机为 **Windows 11 + PowerShell 7**；本会话 shell 为 Git Bash，路径用正斜杠，环境变量用 `$VAR` 而非 `%VAR%`。
- 涉及 macOS Accessibility / Linux AT-SPI 等平台能力时，在 Windows 上无法实跑验证，需明确标注"需在目标平台验证"。


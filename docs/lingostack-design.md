# LingoStack（译栈）设计文档

> 版本：1.3 · 日期：2026-08-06 · 状态：已确认设计，待实施规划
>
> 变更：
> - v1.3 新增 §14 开源治理任务清单（Backlog）；原 §14/§15 顺延为 §15/§16
> - v1.2 新增 §13 V0（基础环境搭建）阶段，明确脚手架交付物与验收标准
> - v1.1 补充开源发布策略（§11），章节顺延重编号

## 1. 产品概述

**译栈（LingoStack）** 是一款面向程序员的跨平台桌面翻译工具，定位为"轻量、简洁、现代"的系统常驻小工具。以**划词翻译**和**写作输出辅助**为核心场景，提供文本翻译、变量名生成、解释朗读、收藏管理、文档翻译等能力。

核心痛点：程序员日常阅读英文文档、编写代码/注释/文档时，需要快速、专业、符合开发行业语言的翻译辅助，而非直译。

## 2. 目标与成功标准

### 2.1 目标
- 提供**轻量**的桌面体验（Tauri 2，安装包 ~10MB，内存占用低）
- **任意应用中**选中文本即可获得专业翻译（PopClip 式交互）
- 翻译遵循**开发行业语言**，避让产品名、变量名、命令名、技术名词，避免直译
- 支持**自定义 LLM 提供商/模型**，核心功能零订阅、零内置计费，仅用户自定义 Key
- 作为 **MIT 开源项目**发布，接受社区贡献，隐私透明（零遥测）

### 2.2 非目标（明确不做）
- 不做网页翻译/浏览器扩展
- 不内置任何免费模型额度或订阅计费
- 不做账号体系、云同步（V1；WebDAV 同步列为 V2 选项）
- 不做 PDF 扫描版 OCR（V1；列为 V2）

### 2.3 成功指标
- 划词 → 翻译结果展示的延迟（用户感知时间）< 3s（在正常网络与常用模型下）
- 三种核心场景（划词、文本翻译、变量名生成）全流程 E2E 测试通过
- 热键冲突时用户能明确感知并完成修复
- 系统资源占用：常驻时内存 < 150MB、CPU 空闲时 ~0%

## 3. 核心用户场景

### 场景 1：划词翻译（P0，核心）
用户在任意应用（IDE、浏览器、文档）中选中文本 → 弹出紧凑动作条（PopClip 式，5 个图标按钮：翻译/解释/朗读/收藏/复制）→ 点「翻译」弹出翻译浮窗，流式渲染译文 → 可继续朗读/收藏/复制。

### 场景 2：文本翻译（P0）
主窗口「翻译」标签页：粘贴或输入文本 → 选择源语言/目标语言（默认按语言映射规则自动判定）→ 流式翻译 → 可收藏、复制。

### 场景 3：变量名生成（P0）
主窗口「命名」标签页：输入中文/描述（如"获取用户资料"）→ 生成多个候选变量名/参数名/类名（按规范如 camelCase / snake_case / PascalCase）→ 一键复制。

### 场景 4：文档翻译（P1）
主窗口「文档」标签页：拖入 Markdown / PDF / DOCX 文件 → 提取全文 → 分块翻译 → 应用内**对照阅读**（左原文/右译文，段落级对齐）→ 导出（保持格式 / Markdown / 纯文本）。

### 场景 5：收藏管理（P0）
主窗口「收藏」标签页：展示收藏的单词/短句，支持搜索、分组（可选）、导出导入 JSON、朗读。

### 场景 6：设置与 LLM 配置（P0）
主窗口「设置」标签页：LLM 提供商配置（多提供商、按功能指定默认模型、全局默认兜底）、语言映射、界面语言、热键管理（含冲突检测）、Prompt 自定义、主题。

### 场景 7：词条解释（P0）
在划词工具栏/浮窗/收藏中点「解释」→ 弹窗展示：词义、词性、例句、开发语境用法（如"concurrency 在 Go 中常与 goroutine 一起出现"）。可选显示音标。

## 4. 技术栈选型

### 4.1 核心框架：Tauri 2
| 维度 | 决策 |
|------|------|
| 框架 | Tauri 2（Rust 后端 + WebView2/WebKit/WKWebView 前端） |
| 前端 | React 18 + TypeScript + Tailwind CSS + shadcn/ui + Zustand |
| 构建 | Vite + tauri CLI |

**选择理由**：轻量（~10MB 安装包 vs Electron ~100MB+）、内存占用低、符合"小工具"定位；Rust 后端提供系统能力（取词、热键、托盘、TTS、文档解析、LLM）。

### 4.2 系统能力（Rust crates，Cargo workspace）
| Crate | 职责 | 平台 |
|-------|------|------|
| `lingostack-core` | 配置模型、语言判定、事件总线、热键冲突检测逻辑（纯 Rust，无 Tauri 依赖） | 跨平台 |
| `lingostack-llm` | LLM 适配层：OpenAI 兼容 / Anthropic / Gemini / Ollama；`LlmProvider` trait + `chat_stream()` | 跨平台 |
| `lingostack-selection` | 系统取词：Windows UIA、macOS Accessibility（经 Swift helper）、Linux AT-SPI | 分平台 |
| `lingostack-hook` | 全局热键、托盘、单实例锁 | 跨平台 |
| `lingostack-tts` | 系统 TTS：Windows `tts` crate / macOS AVSpeechSynthesizer | 分平台 |
| `lingostack-docparse` | 文档解析：Markdown / PDF（文本版）/ DOCX 提取、分块、结构骨架 | 跨平台 |
| `lingostack-app` | Tauri 入口、窗口管理、IPC commands/events 组装 | 跨平台 |

### 4.3 前端窗口架构
| 窗口 | 触发 | 生命周期 |
|------|------|---------|
| 主窗口 | 托盘/热键唤起 | 关闭即销毁，按需重建 |
| 翻译浮窗 | 全局热键 / 划词「翻译」 | 常驻隐藏，按需显示 |
| 划词工具栏 | 选中文本自动弹出 | 常驻隐藏 |
| 文档阅读器 | 文档标签页打开文件 | 独立窗口（P1） |

### 4.4 划词取词方案
- **macOS**：原生 Swift 辅助模块（`helpers/`），调用 Accessibility API screen-scraping 读取选中文本与位置
- **Windows**：Rust 调用 UI Automation
- **Linux**：X11 AT-SPI（P1 起）
- 取词失败降级：提示辅助功能权限授权引导 + 剪贴板取词

### 4.5 LLM 提供商（V1 全支持）
OpenAI 兼容协议为基座（覆盖 DeepSeek/通义/智谱/Ollama 等），Anthropic / Gemini 原生适配。统一 `LlmProvider` trait（`chat_stream()` 返回 SSE 流），功能层（翻译/命名/解释）只认 trait。

## 5. 语言映射与目标语言规则

```
1. 命中「语言对映射」配置（如 中文→英文）→ 用映射目标
2. 未配置映射 → 用界面语言作为目标
3. 原文语言 == 界面语言 → 目标改为英文
4. 全部未命中 → 全局默认目标语言设置
```

界面语言可设置（默认跟随系统），支持中/英。

## 6. LLM 配置模型

### 6.1 提供商配置
- 支持多个提供商并存（每个含 baseURL、API Key、模型列表）
- 每功能（翻译/命名/解释）可指定**默认模型**
- 支持**全局默认模型**作为兜底
- 模型未指定时：功能默认 → 全局默认 → 提示配置

### 6.2 Prompt 自定义
- 所有 AI 功能（翻译/命名/解释/文档翻译）支持 Prompt 自定义，**留空则使用系统内置**
- 系统内置 Prompt 做快照测试，防止无意改动导致风格回归

## 7. 系统交互设计

### 7.1 启动与驻留
- 启动即驻留**托盘**（仅托盘图标，无任务栏/Dock 图标）
- 启动短暂提示"已驻留托盘"（几秒后自动消失）
- 托盘菜单：打开主窗口 / 划词翻译 / 收藏 / 设置 / 退出

### 7.2 全局热键（自定义 + 冲突检测）
- 支持自定义全局热键（划词唤起、打开主窗口、翻译浮窗等）
- **冲突检测**：热键注册失败即视为冲突，返回冲突按键信息，设置页标红提示
- 热键捕获：Windows `RegisterHotKey`、macOS Carbon/Media Key、Linux X11

### 7.3 划词工具栏（PopClip 式）
- 选中文本后自动弹出（监听选中变化，经原生辅助 API）
- 5 个动作按钮：翻译 / 解释 / 朗读 / 收藏 / 复制
- 小、圆润、紧凑；不挡视线，可快速连续操作

## 8. 数据与存储

| 数据 | 存储 | 说明 |
|------|------|------|
| 应用配置（LLM/语言/热键/主题） | Rust 侧 JSON 配置文件（`dirs` crate 获取跨平台配置目录） | Rust 直接读写，无需 IPC 往返 |
| 收藏 | 前端 IndexedDB | 仅 UI 层消费；V2 若 WebDAV 同步再迁移 SQLite |
| Prompt 模板 | 内置常量 + 用户覆盖（JSON 配置） | 快照测试保护 |

## 9. 错误处理

| 错误 | 处理 |
|------|------|
| LLM 请求超时/5xx | 自动重试 1 次（指数退避），失败浮窗提示，不吞错 |
| 速率限制 429 | 显示等待提示，自动降并发 |
| 取词失败（辅助权限未授予） | 降级：提示授权引导 + 剪贴板取词 |
| 热键冲突 | 注册失败即报冲突，浮窗提示 + 设置页标红 |
| 文档解析失败 | 明确报错 + 支持拖入纯文本兜底 |
| 流式中断 | 浮窗保留已渲染部分 + 「重试」按钮 |

## 10. 自动化测试与 CI/CD

### 10.1 测试策略（四层）
| 层级 | 工具 | 覆盖 |
|------|------|------|
| Rust 单元测试 | `cargo test` | core（配置序列化、语言判定、热键冲突检测逻辑）、docparse（解析/分块）、prompt 构建 |
| LLM 集成测试 | mock HTTP server（wiremock） | 四提供商协议解析、SSE 流解析、超时/重试 |
| 前端测试 | Vitest + Testing Library | 组件、zustand stores、语言判定工具函数 |
| E2E 测试 | tauri-driver + WebDriver | 真实应用核心链路：划词→弹工具栏→翻译→浮窗显示、收藏流程、设置保存（三平台） |

**Prompt 快照测试**：所有内置 Prompt 模板做快照测试。

### 10.2 CI/CD（GitHub Actions）
- **PR 触发**：lint（clippy + eslint）→ 单测（3 平台矩阵）→ 构建 → E2E（可选）
- **Tag `v*` 触发**：全流程 + tauri-action 打包发布 GitHub Releases
- 产物：Windows NSIS/MSI · macOS dmg（notarize）· Linux deb/AppImage
- macOS notarization；Windows 代码签名（先用自签名，正式发布购证书）
- CI 缓存：cargo registry / node_modules

## 11. 开源策略（本项目为 MIT 开源项目）

### 11.1 许可证与版权
- **MIT License**，保留版权声明与免责声明
- 尊重第三方依赖许可证（Rust crates / npm 包），发布时附 `THIRD_PARTY_NOTICES`（由 CI 从 Cargo.lock / package-lock 自动生成）
- 贡献者协议：采用 **DCO（Developer Certificate of Origin）**，CI 检查 `Signed-off-by`，避免 CLA 的行政负担

### 11.2 隐私与数据收集（零遥测）
- **完全不收集**任何遥测/统计/崩溃数据，无后端依赖
- 崩溃时用户手动通过 GitHub Issue 附本地日志（日志文件中不记录 API Key）
- 文档明示隐私承诺：所有 LLM 请求直连用户配置的提供商，工具本身不经过任何中间服务器
- 后续若引入可选统计，必须**默认关闭** + 隐私说明 + 单独的配置项

### 11.3 社区与贡献规范
- `CONTRIBUTING.md`：代码风格（rustfmt + clippy 无警告）、测试要求（新功能必须带测试）、PR 流程（所有 CI 绿才可合并）
- 内置 **Issue 模板**（Bug 报告 / 功能请求）与 **PR 模板**
- 支持多语言用户：界面语言含 i18n 框架（V1 中/英，V2 社区可提交翻译）
- 文档（README / 使用指南）以中英双语维护，README 含功能截图、快速开始、截图、FAQ

### 11.4 安全与密钥管理
- API Key 存于本地配置（权限 0600），**绝不进日志 / 崩溃报告 / Issue 模板**
- CI 中不使用真实密钥（只用 mock 集成测试）；签名/发布凭据存 GitHub Secrets
- 依赖安全：Dependabot 自动 PR + `cargo audit` / `npm audit` 纳入 CI

### 11.5 发布与产物
- 发布流程与 CI/CD 一致（见 §10）：GitHub Releases 附带校验和
- 发布说明自动生成（Release Notes，从 PR 标题聚合）
- Windows 代码签名：先用自签名，正式发布后再购证书

### 11.6 可持续维护
- 保持依赖更新（Dependabot + 定期人工 review）
- 明确维护者职责、响应时间承诺（社区标准）、Issue 处理策略（标定优先级/协助维护者）

## 12. UI 设计规范

### 11.1 视觉风格：中性灰蓝 · 克制专业（Linear/Vercel 风）
- 灰蓝中性色 + 单一蓝色强调色（`#2563eb` 浅色 / `#3b82f6` 深色）
- 圆角 10-14px，无投影或极轻投影
- 字体：Inter / system-ui
- 明暗主题：浅色（背景 `#f8fafc`）/ 深色（背景 `#0f172a`）+ 跟随系统

### 11.2 划词工具栏（已确认）
- PopClip 式紧凑动作条：5 个图标按钮（🌐翻译 / 📖解释 / 🔊朗读 / ⭐收藏 / 📋复制）
- 选中后立即在文本旁弹出，小而圆润

### 11.3 翻译浮窗（已确认）
- 原文在上、译文在下（流式渲染）
- 顶部：语言标签（EN → 中文）+ 动作按钮（朗读/收藏/复制）
- 可拖动、可固定

### 11.4 主窗口标签页
翻译 / 命名 / 文档 / 收藏 / 设置（5 个标签页）

### 11.5 文档对照阅读（已确认，P1）
- 左原文 / 右译文，段落级对齐
- 底部导出：保持格式 .docx / Markdown / 纯文本

## 13. 分期计划

### V0（基础环境搭建 · Scaffolding）

**目标**：从「仅有设计文档」推进到「框架可编译运行、工具链与 CI 全绿」，为 V1 业务开发铺平道路。本阶段**不实现任何业务逻辑**，仅交付可编译、可启动、可测试的空壳骨架，并固定仓库布局与依赖版本。

**交付物：**

- **Cargo workspace 骨架**：根 `Cargo.toml`（workspace + 共享依赖/profile）；按 §4.2 与仓库布局创建七个 crate，各自 `Cargo.toml` + 入口文件，仅含模块声明与 `TODO` 占位：
  - `lingostack-core`（纯逻辑，**禁止依赖 `tauri`**，以 CI 校验）
  - `lingostack-llm`（声明 `LlmProvider` trait 与 `chat_stream()` 签名空壳）
  - `lingostack-selection`（trait 抽象 + 按平台分文件占位）
  - `lingostack-hook` / `lingostack-tts` / `lingostack-docparse`（模块占位）
  - `lingostack-app`（**唯一依赖 `tauri`** 的入口，`main.rs` 仅注册空 IPC command）
- **Tauri 2 前端工程**（`src-tauri/`）：pnpm + React 18 + TypeScript（严格模式）+ Vite；Tailwind CSS（接入 §12 色板/圆角令牌）；shadcn/ui 初始化；Zustand store 占位；主窗口渲染最小占位页
- **最小可运行应用**：`pnpm tauri dev` 启动并显示主窗口占位界面；`tauri.conf.json` 仅配置主窗口（翻译浮窗 / 划词工具栏 / 文档阅读器留待 V1）
- **质量门禁工具链**：`rust-toolchain.toml`（固定 stable + rustfmt/clippy）；rustfmt；clippy（workspace 级 `-D warnings`）；ESLint + Prettier；`.editorconfig`
- **测试基础设施骨架**：`cargo test --workspace` 可跑（每 crate 至少一个冒烟测试）；Vitest 配置 + 冒烟测试；声明 `wiremock` 依赖（供 V1 LLM 集成测试）
- **CI 骨架**：`.github/workflows/ci.yml`（PR 触发：clippy + eslint → 单测 → 构建，windows/macos/linux 矩阵，cargo/npm 缓存）；`.github/dependabot.yml`；DCO `Signed-off-by` 检查
- **仓库文件**：更新 `.gitignore`（前端/Tauri 产物、IDE 文件）

**验收标准（Definition of Done）：**

- `pnpm tauri dev` 启动并显示主窗口占位界面（Windows 主开发机实跑验证；macOS/Linux 平台能力标注「需在目标平台验证」）
- `cargo build --workspace` 通过
- `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings` 零警告通过
- `cargo test --workspace` 与 `pnpm lint` / `pnpm test` 全绿
- CI 首次跑通（三平台 lint + 单测绿）
- 七个 crate 结构与仓库布局一致，`lingostack-core` 无 `tauri` 依赖
- 回填 `CLAUDE.md`「常用命令」小节为实际可用命令

**范围边界（移交 V1 及以后）**：任何业务功能（翻译 / 取词 / 热键 / TTS / 文档解析 / LLM 实调 / 收藏 / 设置）、多窗口、真实 Prompt 模板与快照测试、真实 LLM 集成用例、开源治理细则（`CONTRIBUTING.md` 与模板内容、`THIRD_PARTY_NOTICES` 生成、cargo/npm audit 门禁）。

### V1（核心 MVP）
- 划词翻译（选中自动弹 PopClip 式工具栏 + 热键唤起 + 读选中）
- 文本翻译、变量名生成、解释朗读、收藏管理
- 托盘 + 全局热键 + 冲突检测
- LLM 多提供商配置（功能默认模型 + 全局兜底）
- 主题（明暗 + 跟随系统）、界面语言
- 语言映射规则
- 测试 + CI/CD 基础设施
- 开源基建：MIT 许可证、CONTRIBUTING.md、Issue/PR 模板、DCO 检查、Dependabot + cargo/npm audit、THIRD_PARTY_NOTICES 生成

### V1.5（增强）
- 文档翻译（md/pdf-txt/docx 提取 + 分块 + 对照阅读 + 导出）
- 自动弹工具栏优化（监听选中变化去抖，减少误弹）
- 社区翻译贡献流程（i18n 新增语种支持）

### V2（扩展）
- PDF 扫描版 OCR（Tesseract 集成）
- WebDAV 同步（如需）
- Linux AT-SPI 取词完善

## 14. 开源治理任务清单（Backlog）

> 本节汇总开源项目治理的可执行任务，作为跨阶段 backlog 跟踪。**原则见 §11，发布自动化见 §10.2。** 已完成项标注 ✅；其余按归属阶段与优先级排序，供后续迭代认领。任务不绑定单一阶段，可随社区反馈调整。

### 14.1 贡献规范与社区入门

- [ ] `CONTRIBUTING.md`：本地环境搭建、代码风格（rustfmt + clippy 零警告 / eslint）、测试要求、分支与提交规范、PR 流程
- [ ] `CODE_OF_CONDUCT.md`（Contributor Covenant v2.1，中英双语）
- [ ] Issue 模板：Bug 报告 / 功能请求 / 翻译改进（含复现步骤、环境信息；**模板中明示「勿粘贴 API Key」**）
- [ ] PR 模板：变更说明、自测清单、DCO 提醒
- [ ] README 英文版 `README.en.md`，与中文版互链（§11.3 双语要求）

### 14.2 CI/CD 与自动化门禁

- [x] DCO `Signed-off-by` 检查（`.github/workflows/dco.yml`） ✅
- [x] Dependabot（cargo / npm / github-actions，`.github/dependabot.yml`） ✅
- [x] CI 三平台矩阵（lint → 单测 → 构建）+ `lingostack-core` 纯净性校验 ✅
- [ ] `cargo audit` / `pnpm audit` 纳入 CI 门禁，失败阻断合并
- [ ] `THIRD_PARTY_NOTICES` 生成脚本（从 `Cargo.lock` / `pnpm-lock.yaml` 提取许可证），发布前自动产出
- [ ] 自动打标签（labeler：`rust` / `frontend` / `ci` / `i18n` 等）

### 14.3 发布管理

- [ ] Tag `v*` 触发 `tauri-action` 打包：Windows NSIS/MSI · macOS dmg · Linux deb/AppImage
- [ ] Release 产物附 SHA256 校验和
- [ ] Release Notes 从 PR 标题自动聚合（release-drafter 或同类）
- [ ] macOS notarization；Windows 代码签名（自签名先行 → 正式发布购证书，见 §11.5）
- [ ] `CHANGELOG.md` 维护策略

### 14.4 文档治理

- [ ] 用户使用指南 + FAQ（截图、快捷键、各 LLM 提供商配置示例）
- [ ] ADR（架构决策记录）目录 `docs/adr/`，记录关键决策（toolchain 选型、`src-tauri` 目录约定、cdylib 取舍等）
- [ ] 截图与演示 GIF（随 V1 功能落地补充到 README）

### 14.5 安全治理

- [ ] `SECURITY.md`：漏洞上报流程（GitHub 私密 advisory）、响应时效承诺
- [ ] API Key 泄漏审计：CI 静态扫描确认 Key 不进日志 / 产物 / Issue 模板（见 §11.4）
- [ ] 依赖漏洞响应流程（Dependabot PR → 评估 → 升级 / 打补丁）

### 14.6 社区与可持续维护

- [ ] i18n 翻译贡献流程：术语表 + 上下文字符串说明，翻译走 PR review（见 §11.3）
- [ ] 维护者职责说明：Issue 分类策略、响应时间承诺、协作者晋升机制
- [ ] 版本号策略（SemVer）与分支策略（main 稳定 / develop 集成 / release 分支）文档化
- [ ] 项目看板（GitHub Projects）管理 roadmap 与里程碑

> **与分期计划的关系**：贡献规范、安全策略建议在 V1 功能落地前完成；发布管理与签名在 V1 首个可用版本前就绪；i18n 流程在 V1.5 社区翻译启动前建立。

## 15. 开放问题（待实施规划时细化）

- 变量名生成的命名规范列表（camelCase/snake_case/PascalCase/kebab-case 等）与候选数量
- 收藏的分组/标签是否 V1 就做
- 文档翻译分块策略（按段落 vs 按上下文窗口 + 重叠）
- 热键默认值（如 Cmd/Ctrl+Shift+T / Option+Space 等）
- 单实例锁的强约束（允许重启时无残留）

## 16. 风险与对策

| 风险 | 对策 |
|------|------|
| macOS Accessibility 权限复杂 | 提供引导流程 + 降级剪贴板取词 |
| 各平台取词 API 差异大 | 分平台实现，抽象成统一 trait |
| LLM 提供商协议差异 | 以 OpenAI 兼容为基座，其余按需适配，集成测试兜底 |
| 文档解析（docx/PDF）复杂 | 用成熟库（pandoc / pdf-extract），分块策略迭代 |
| 流式 UI 卡顿 | 译文流式渲染用 React 并发特性 + 防抖 |
| 热键被系统占用 | 冲突检测 + 提示更换 |
| 开源项目维护负担 / 贡献质量参差 | CONTRIBUTING 规范 + CI 强制门禁 + 维护者 review |
| 社区翻译（i18n）质量参差 | 翻译走 PR review，提供术语表与上下文字符串 |
| 第三方依赖漏洞 | Dependabot + cargo/npm audit 纳入 CI |
| 代码签名证书成本 | Windows 自签名先行，正式发布再购证书 |

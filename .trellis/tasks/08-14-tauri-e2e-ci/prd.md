# Tauri E2E and CI infrastructure

## Goal

为 LingoStack 建立可维护的真实桌面自动化测试基础设施：开发者通过一个清晰的 pnpm 命令构建并启动测试专用 Tauri 应用，GitHub Actions 在 Windows 上执行稳定、可诊断的阻塞 E2E 门禁；测试不使用真实 LLM API Key、外部网络或人工操作，同时保持生产发行包不含任何 WebDriver 测试能力。

## Background and confirmed facts

- 本工作树在规划开始时的 HEAD 为 `73d3829f0b0ab75d7dcf3fef2d27769f54c2f8da`，分支为 `phoben/tauri-e2e-ci`；除本任务 Trellis 文件外没有既有工作树改动。
- 2026-08-14 本机重新核验为 Windows NT `10.0.26200.0`、Node `22.19.0`、pnpm `10.30.1`、Rust/Cargo `1.94.1`、WebView2 Runtime `151.0.4129.78`。初始工作树没有 `node_modules`，因此 Tauri CLI 尚不能从本地依赖执行；必须以全新安装后的结果作为最终证据。
- 仓库当前只有 Vitest、三平台 Rust CI 与 Ubuntu 前端 CI；没有 WDIO 依赖、E2E 目录、测试插件、测试 capability、测试脚本、桌面 E2E job 或失败工件配置。
- 当前翻译链路是 `TranslateView -> stream-store -> src/lib/ipc.ts -> chat_stream -> LlmProvider -> Tauri Channel -> UI`。成功、错误和重试已有可观察 UI；设置提供商持久化和结果收藏也已实现。
- 当前源码没有独立浮窗或划词工具栏；文档翻译等路线图能力仍未实现，不能为其编造通过用例。
- Tauri 与 WebdriverIO 当前官方文档推荐 `@wdio/tauri-service`，embedded provider 支持 Windows/Linux/macOS，并要求 `tauri-plugin-wdio-webdriver`；执行/IPC mock/日志能力还要求 `tauri-plugin-wdio` 与前端 guest plugin。官方兼容声明不是本仓库 Linux/macOS CI 的实际运行证据。

## Requirements

### R1. One-command local desktop E2E

- 新依赖通过 `pnpm install --frozen-lockfile` 安装后，开发者可用 `pnpm test:e2e` 完成测试专用前端构建、Tauri 测试二进制构建、真实应用启动、WDIO 执行和清理。
- 命令成功返回 `0`，构建/启动/用例失败返回非零；无需预先手动启动应用或 driver。
- WDIO 使用 `driverProvider: "embedded"`，初始串行执行，端口、启动、命令和用例均设置有限超时。

### R2. Deterministic fixtures and state isolation

- 翻译成功与失败使用仅在 E2E Cargo feature 下编译的确定性 `LlmProvider` fixture；它必须覆盖真实 Rust `chat_stream` 与 Tauri `Channel`，不得发送外部 HTTP 请求或读取真实 API Key。
- 测试应用使用每次运行独立的配置文件路径，不读取或写入开发者/CI 账户的生产配置。
- 浏览器侧持久状态在套件开始时清理；fixtures、临时配置、应用进程和 embedded WebDriver 端口在成功、失败和超时后均可恢复到可再次运行的状态。

### R3. Strict test/production isolation

- `tauri-plugin-wdio` 与 `tauri-plugin-wdio-webdriver` 必须是可选 Cargo 依赖，只由明确的 E2E feature 启用并条件注册；默认及 release 生产构建不启用。
- WDIO guest plugin 只进入 E2E 前端构建；普通 `pnpm build` 不加载或打包测试桥接代码。
- 生产 capability 仅启用现有 `default`；WDIO 权限放在独立 E2E capability 中，并只由测试配置选入。
- 必须提供可重复执行的自动化隔离检查，证明默认 Cargo 依赖图、生产配置/能力和普通前端产物不包含 WDIO 测试面。

### R4. Real desktop scenarios

至少覆盖以下真实应用场景，并优先使用 role、accessible name、`aria-current`、`aria-busy`、`role=alert` 等稳定语义选择器：

1. 应用启动与导航 smoke：等待主导航可用，进入设置，再返回翻译页并确认核心控件可交互。
2. 确定性翻译成功：输入固定文本，触发真实 IPC/fixture provider/Channel 流，等待完成并断言精确输出。
3. 确定性错误与恢复：fixture 返回已知错误，断言现有错误提示与重试入口；重试后得到确定性成功结果。
4. 设置持久化：通过现有设置 UI 修改测试提供商/模型配置，重新加载应用 UI 后确认从隔离配置中恢复。
5. 结果操作：将成功译文收藏，进入收藏页确认该结果可见；不得依赖上次运行残留的 IndexedDB 数据。

### R5. Diagnostics and repeatability

- WDIO 输出稳定路径下的控制台/服务日志和 JUnit XML；失败用例保存截图。
- CI 无论 E2E 成败都上传报告、日志和截图，并采用明确保留期；上传步骤不掩盖测试退出码。
- 本机至少连续执行两次完整 E2E；每次结束后确认没有残留应用进程，embedded WebDriver 端口可重新绑定。

### R6. CI integration

- 在现有 `.github/workflows/ci.yml` 中增加独立的 `windows-latest` 真实 Tauri embedded E2E 阻塞 job，不复制已有 Rust/frontend 检查。
- job 安装仓库锁定的 pnpm/Node/Rust 环境和必要 Windows 前置，执行唯一 E2E 命令，并上传诊断工件。
- Linux/macOS embedded provider 只记录官方支持与静态评估；在本仓库获得对应平台真实成功记录之前，不纳入阻塞矩阵，也不表述为已运行通过。

### R7. Verification boundaries and documentation

- README 或专用测试文档说明本地命令、依赖、运行流程、CI 行为、工件位置、故障排查、测试/生产隔离和重复运行检查。
- 文档明确 WebDriver 能证明的应用窗口/DOM/IPC/fixture 边界。
- 为跨应用全局快捷键、外部应用选区读取、剪贴板降级和真实扬声器播音提供可执行的 Windows 原生/手工验收步骤；不得把 WebDriver 用例描述成这些系统行为的证明。

### R8. Existing quality gates remain green

- 保持并实际执行 `pnpm lint`、`pnpm test`、`pnpm build`、`cargo fmt --all --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test --workspace`、`cargo build --workspace`。
- CI YAML 至少经过本地解析/静态检查；平台运行证据必须按实际执行环境分别记录。

## Acceptance Criteria

- [ ] AC1 — 在全新 `pnpm install --frozen-lockfile` 后，Windows 上 `pnpm test:e2e` 独立启动真实 Tauri 应用并通过 R4 的五类场景，退出码为 `0`。
- [ ] AC2 — 完整 E2E 连续执行两次均通过；每次结束后测试应用进程不存在，embedded 端口可绑定，临时配置被清理或位于明确的可回收目录。
- [ ] AC3 — 成功与错误链路均经过真实 `chat_stream`/Tauri `Channel`；fixture 代码仅在 E2E feature 中存在，测试无需 API Key，且运行期间不访问外部 LLM endpoint。
- [ ] AC4 — 自动化生产隔离检查通过；默认 `cargo tree -p lingostack-app` 不含两个 WDIO Rust 插件，普通前端构建产物不含 WDIO guest bridge，生产 capability 不授予 `wdio:`/`wdio-webdriver:` 权限；`cargo build --release -p lingostack-app` 成功。
- [ ] AC5 — Windows CI E2E job 是阻塞门禁；YAML 静态校验通过，JUnit、日志和失败截图使用 `if: always()` 上传且路径与保留期明确。
- [ ] AC6 — R8 的七条既有门禁全部在当前 Windows 环境实际执行并通过；未运行的 Linux/macOS E2E 只记录为官方兼容/静态配置证据。
- [ ] AC7 — 测试文档可让新开发者仅按文档完成安装与运行，并包含 Windows 系统级验收清单、故障定位入口和生产隔离说明。

## Out of Scope

- 用 WebDriver 自动证明跨应用全局快捷键、外部应用 UIA/选区、真实扬声器可听输出或操作系统原生文件选择器。
- 对未实现的独立划词工具栏/浮窗、词条解释、完整文档翻译、V1.5/V2 路线图能力编写伪通过用例。
- 在缺少本仓库真实运行记录时把 Linux/macOS embedded E2E 纳入阻塞矩阵。
- 发布安装包、改动业务 UX、引入真实云 LLM 凭据或推送/提交 Git 变更。

## Evidence

- [`research/official-wdio-tauri.md`](research/official-wdio-tauri.md) — 当前官方集成、生产隔离、平台与诊断依据。
- [`research/current-app-testability.md`](research/current-app-testability.md) — 仓库现状、真实链路、稳定语义入口与系统边界。

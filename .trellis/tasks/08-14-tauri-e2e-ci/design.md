# Technical design

## Architecture and boundaries

采用一条测试专用但尽量贴近生产的桌面链路：

```text
pnpm test:e2e
  -> build frontend in E2E mode
  -> cargo/tauri build with feature `e2e`
  -> @wdio/tauri-service (embedded provider)
  -> real LingoStack window and semantic DOM interaction
  -> production IPC facade + Rust commands + Tauri Channel
  -> feature-gated deterministic LlmProvider fixture
```

测试基础设施不在 `lingostack-core` 或 `lingostack-llm` 增加 Tauri 依赖。测试装配属于 `lingostack-app`；确定性 provider 实现只在该应用 crate 的 `e2e` feature 下编译。

## Dependency and feature design

- 在 workspace 中集中声明 `tauri-plugin-wdio` 与 `tauri-plugin-wdio-webdriver`，在 `src-tauri/Cargo.toml` 作为 `optional = true` 依赖。
- 新 feature `e2e = ["dep:tauri-plugin-wdio", "dep:tauri-plugin-wdio-webdriver"]`；`default` 仍只有生产所需 feature，release 命令不带 `e2e`。
- `src-tauri/src/lib.rs` 维持既有插件/状态/命令/setup 顺序，只在 `#[cfg(feature = "e2e")]` 分支注册 WDIO 两插件。
- 前端 `@wdio/tauri-plugin` 是 devDependency，只由 Vite E2E mode 的编译期常量触发；普通构建分支在打包时消除，并由隔离脚本扫描产物验证。

## Capability and Tauri configuration isolation

- 生产 `tauri.conf.json` 显式选择现有 `default` capability，避免 capabilities 目录新增文件后被默认全量启用。
- 新增独立 E2E capability，仅包含最小 `wdio:allow-execute`/日志所需权限和 `wdio-webdriver:default`。
- 新增 E2E 配置 overlay，在测试构建中选择 `default + e2e`、启用 E2E 前端 build mode，并关闭无意义的安装包 bundling。
- 普通生产配置和 default capability 不出现任何 WDIO 权限。

## Deterministic provider and configuration

- 新增 `#[cfg(feature = "e2e")]` fixture provider，实现现有 `LlmProvider` trait，按固定测试输入返回分块成功流或确定性错误。它不创建 HTTP client，也不读取 API Key。
- provider 工厂仅在 `e2e` feature 且配置使用保留的 E2E fixture endpoint/模型时选择该实现；其他配置继续走现有四种生产 provider。这样测试覆盖 `resolve_model`、命令、Channel、状态 store 和 UI，同时不会把 fixture 暴露给生产二进制。
- `config_path()` 在 `e2e` feature 下接受专用环境变量覆盖；未启用 feature 时完全忽略该变量。应用状态和 setup 热键读取必须共享同一解析结果，避免一处使用隔离文件、另一处触碰真实配置。
- Node/WDIO 启动层为每次运行创建临时目录和固定初始配置，传给子进程；套件启动时清理 localStorage/IndexedDB，结束时清理临时状态。

## WDIO runner design

- TypeScript `wdio.conf.ts` 使用 local runner、Mocha、`maxInstances: 1`、embedded provider、显式 app binary、有限启动/连接/用例超时。
- 语义选择器优先；只在当前 UI 缺少可访问名称且语义无法稳定定位时补最小 `aria-label`，不批量引入 `data-testid`。
- 用例按业务场景组织：startup/navigation、translation success、translation error/retry、settings persistence、favorite result。
- before hook 清理 WebView 持久数据并装载 fixture；afterTest 仅在失败时截图。JUnit、runner/service/app logs 和 screenshots 固定输出到 `artifacts/e2e/`。
- service 负责正常应用生命周期；wrapper/final hook 做防御性关闭与端口可用性诊断。串行两次运行作为残留进程/端口的验收证据。

## CI design

- 扩展现有 `ci.yml`，增加单独 `e2e-windows` job；不重复已有 frontend/Rust 全量门禁。
- job 使用 `windows-latest`、仓库锁定 pnpm、Node 22、stable Rust 和缓存，安装依赖后运行 `pnpm test:e2e`。
- 测试步骤的非零退出码保持阻塞；独立 artifact upload 使用 `if: ${{ always() }}`，上传 `artifacts/e2e/**` 并设置有限 retention。
- 当前不创建 Linux/macOS E2E matrix。官方支持记录在文档；只有对应 GitHub-hosted runner 真实成功后才升级为阻塞项。

## System-level validation boundary

WebDriver 自动覆盖真实窗口、DOM、Tauri IPC、配置持久化、fixture provider、Channel 与应用结果操作。以下行为另设 Windows 验收清单：在外部编辑器中选区后触发全局快捷键、UIA 失败时剪贴板降级、系统扬声器可听输出及打断。已有可单测的快捷键冲突/序列化和 provider 纯逻辑继续由 Rust tests 覆盖，但不得替代人工系统结果。

## Compatibility, rollout, and rollback

- 依赖锁文件固定实际解析版本；实现时重新核验 npm/crates 版本与 Tauri 2 编译兼容性。
- 第一阶段仅 Windows blocking，降低把“官方支持”误当成本仓库可靠性的风险。
- 变更主要落在可删除的 feature、测试配置、E2E 目录、脚本、文档和单个 CI job。若 embedded 集成不可用，可回滚这些文件而不修改生产业务数据模型。
- 不采用 external/`official` driver 作为静默后备；若 embedded 真实验证失败，任务回到设计阶段记录证据后再决定替代方案。

## Risks and mitigations

- **Channel mock 不兼容简单 invoke mock**：使用 Rust fixture provider，不依赖仅能返回 Promise 值的前端命令 mock。
- **测试 capability 泄漏生产**：生产配置显式 capability allow-list，加自动化依赖图/配置/产物检查和 release build。
- **开发者真实配置被污染**：E2E-only config path override，setup 与 managed state 共用同一路径。
- **端口/进程残留导致 flaky**：单 worker、有限超时、service cleanup、防御性诊断、连续两次运行。
- **语义选择器受文案变化影响**：以既有 accessible contract 为主；文案变化需同步用例，避免 CSS/DOM 层级选择器。
- **Linux/macOS 被过度承诺**：文档分开记录官方兼容和本仓库实际执行证据。

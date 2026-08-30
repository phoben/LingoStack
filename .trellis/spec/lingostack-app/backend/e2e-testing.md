# 真实桌面 E2E 契约

> WebdriverIO + `@wdio/tauri-service` 的 embedded provider。完整操作说明见 [`docs/testing.md`](../../../../docs/testing.md)；本文只记录实现时不能破坏的代码契约。

## Scenario: 维护 Tauri E2E 基础设施

### 1. Scope / Trigger

以下改动必须同时阅读并验证本契约：Tauri 插件/配置/capability、`build.rs`、IPC/Channel、配置路径、`src/main.tsx` 启动、WDIO runner、桌面 E2E 用例或 CI E2E job。

目标是让测试走真实窗口与 `chat_stream` Channel，同时保证 WDIO 执行桥、embedded server、fixture provider 和测试 ACL 不进入默认生产构建。

### 2. Signatures

```toml
# src-tauri/Cargo.toml
[features]
e2e = ["dep:tauri-plugin-wdio", "dep:tauri-plugin-wdio-webdriver"]
```

```text
pnpm test:e2e                 # 构建测试应用并运行全部桌面 E2E
pnpm test:e2e:build           # Tauri CLI + tauri.e2e.conf.json + feature=e2e
pnpm test:e2e:run             # 只运行 WDIO；通常由 wrapper 调用
pnpm test:production-isolation
```

```rust
// 只在 cfg(feature = "e2e") 下存在并注册；生产 invoke handler 不含这些命令。
fn e2e_emit_translate_selection(app: tauri::AppHandle) -> Result<(), String>;
fn e2e_emit_hotkey_status(
    app: tauri::AppHandle,
    conflicted: bool,
) -> Result<(), String>;
```

测试专用输入契约：

| 名称             | 值 / 类型                             | 作用域                               |
| ---------------- | ------------------------------------- | ------------------------------------ |
| Cargo feature    | `e2e`                                 | 只用于测试二进制                     |
| 环境变量         | `LINGOSTACK_E2E_CONFIG_PATH: PathBuf` | 只在 `cfg(feature = "e2e")` 下读取   |
| fixture endpoint | `lingostack-e2e://fixture`            | 只在 E2E provider 工厂分支识别       |
| fixture model    | `lingostack-e2e`                      | 必须与 endpoint 同时匹配             |
| selection text   | `E2E_CLIPBOARD_SELECTION`             | 划词事件与 TTS 的确定性输入          |
| hotkey payload   | `{ conflicted: boolean }`             | 发真实 `hotkey-status` 冲突/恢复事件 |
| embedded port    | `4445`                                | 单 worker；运行后必须释放            |

### 3. Contracts

- `tauri-plugin-wdio`、`tauri-plugin-wdio-webdriver` 必须是 optional dependency，并仅在 `cfg(feature = "e2e")` 注册。
- 生产 `tauri.conf.json` 只启用 `default` capability，且不得设置 `withGlobalTauri`；`tauri.e2e.conf.json` 才启用 `withGlobalTauri`、`default + e2e` capability、独立 identifier `dev.lingostack.e2e` 和无 bundle 构建。
- `build.rs` 必须声明 `rerun-if-env-changed=CARGO_FEATURE_E2E`：默认构建只扫描 `capabilities/default.json`，E2E feature 才扫描含 `e2e.json` 的 capability 集合。不能依赖上一次 feature 构建留下的 codegen 输出。
- `src/main.tsx` 只在 `import.meta.env.MODE === "e2e"` 时动态加载 `@wdio/tauri-plugin`。普通 `pnpm build` 产物不得包含 `wdioTauri` bridge。
- `config_path()` 的 E2E override 必须同时供 managed `AppState` 与 setup 热键读取复用，不能一处隔离、一处仍访问真实用户配置。
- fixture provider 必须实现现有 `LlmProvider`，从 `chat_stream` 返回确定性 chunk/error；不得创建 HTTP client、读取真实 API Key 或绕过 Tauri `Channel`。
- renderer 需要触发热键/选区/TTS 边界时，必须调用只在 `cfg(feature = "e2e")` 注册的后端 fixture command，让事件继续经过真实 Tauri emitter/listener 和生产 UI 状态机。embedded provider 下的 `browser.tauri.mock(...)` / renderer invoke mock 不能作为该链路证据。
- `e2e_emit_translate_selection` 固定发 `source=clipboard` 的 `translate-selection` payload；`e2e_emit_hotkey_status` 只发事件、不触碰系统热键注册表。`speak(E2E_CLIPBOARD_SELECTION)` 与 `stop_speaking()` 在 E2E feature 下只返回确定性成功，不调用 SAPI。
- E2E fixture command 必须同时受函数级 `cfg(feature = "e2e")` 和独立 invoke handler 门控；默认 handler 不准列出命令名。新增 fixture 后必须扩展 production-isolation 检查或等价静态断言。
- `scripts/run-e2e.mjs` 创建临时配置、转发子命令非零退出码并在 `finally` 删除临时目录。WDIO 固定 `maxInstances: 1`，失败截图、JUnit 与日志写到 `artifacts/e2e/`。

### 4. Validation & Error Matrix

| 条件                                                  | 必须结果                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| 默认 Cargo dependency tree 出现 WDIO crate            | `test:production-isolation` 失败                                          |
| 生产 config/default capability 出现 `e2e` 或 `wdio:*` | 隔离检查失败                                                              |
| 普通前端 `dist/` 含 `wdioTauri`                       | 隔离检查失败                                                              |
| `LINGOSTACK_E2E_CONFIG_PATH` 未提供                   | E2E 应在加载 fixture/执行用例时明确失败，不得回退到真实用户配置作为“通过” |
| fixture endpoint/model 不同时匹配                     | 走现有生产 provider 工厂；不得误选 fixture                                |
| fixture 输入为 `E2E_ERROR_THEN_SUCCESS` 首次请求      | 发确定性错误，UI 出现 `role="alert"` 与重试入口                           |
| 默认/发行二进制 invoke `e2e_emit_*`                   | 命令不存在；不得有测试控制面                                              |
| `conflicted=true` 后再发 `false`                      | 设置页先显示 `E2E fixture: occupied`，再清除冲突                          |
| selection fixture 事件                                | 翻译页收到 `E2E_CLIPBOARD_SELECTION` 并显示剪贴板降级提示                 |
| TTS fixture 文本 speak 后 stop                        | UI 从“朗读”进入“停止朗读”再回到“朗读”；不声明物理音频已播放               |
| embedded 端口占用或应用启动超时                       | WDIO 非零退出，并保留 `artifacts/e2e/` 诊断                               |
| 测试结束                                              | `lingostack-app` 无残留、4445 无 listener，可再次运行                     |

### 5. Good / Base / Bad Cases

- **Good**：`pnpm test:e2e` 从临时配置启动 `dev.lingostack.e2e`，覆盖基础五链路以及术语、命名、热键冲突恢复、选区事件和 TTS 状态，随后 `pnpm test:production-isolation` 通过。
- **Base**：只改纯前端逻辑时继续跑 Vitest；若改到真实窗口、IPC、配置持久化或结果操作，再跑完整桌面 E2E。
- **Bad**：为让 guest plugin 可用而在生产 `tauri.conf.json` 打开 `withGlobalTauri`，或把 `wdio:*` 加到 `default.json`。
- **Bad**：用 `browser.tauri.mock("chat_stream")` 替代 fixture provider；简单 invoke mock 不能证明真实 `Channel` 流。
- **Bad**：在 `browser.refresh()` 前后反复重建 renderer mock，或用截图中出现文案代替可重复断言；测试必须走 feature-gated backend seam，并等待真实 DOM 状态。

### 6. Tests Required

- Rust：`cargo test -p lingostack-app --features e2e`，至少断言 fixture provider 的实际 chunk 内容和 E2E 配置路径 override。
- 生产隔离：`pnpm test:production-isolation`，断言默认依赖图、生产 config/capability 和普通前端产物。
- 桌面 E2E：启动/导航、真实 IPC/Channel 成功、确定性错误后重试、设置持久化、结果收藏、术语 envelope、五种命名、热键冲突→恢复、clipboard selection event、TTS speak→stop；断言 role/accessible name、`aria-busy`、`role=alert` 或有界 DOM 状态，不依赖 CSS 层级。
- 清理：连续运行两次；每次确认应用进程为 0、4445 listener 为 0 且端口可重绑。
- 发行回归：`cargo build --release -p lingostack-app` 不带 `e2e` feature。

### 7. Wrong vs Correct

#### Wrong

```json
// src-tauri/tauri.conf.json（生产）
{
  "app": {
    "withGlobalTauri": true,
    "security": { "capabilities": ["default", "e2e"] }
  }
}
```

```rust
// 无 feature 门控，测试 server 会进入生产二进制
builder.plugin(tauri_plugin_wdio_webdriver::init());
```

#### Correct

```json
// 生产只选择 default；测试差异放 tauri.e2e.conf.json overlay
{ "app": { "security": { "capabilities": ["default"] } } }
```

```rust
#[cfg(feature = "e2e")]
{
    builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());
}
```

```rust
// 测试命令本身和注册表都门控；默认 handler 只列生产命令。
#[cfg(feature = "e2e")]
#[tauri::command]
fn e2e_emit_translate_selection(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("translate-selection", deterministic_clipboard_payload())
        .map_err(|error| error.to_string())
}
```

## WebDriver 证明边界

桌面 E2E 证明真实 LingoStack 窗口、DOM、配置 IPC、`chat_stream`/Channel、feature-gated command/event、fixture provider 与 IndexedDB 结果操作。fixture 的热键/选区/TTS 状态只证明应用内事件与 UI 状态机，不能单独证明系统热键注册、外部应用 UIA/选区或真实扬声器可听输出；这些按 `docs/testing.md` 的 Windows 原生清单验收，并遵守 [平台隔离指南](../../guides/platform-isolation-guide.md)。

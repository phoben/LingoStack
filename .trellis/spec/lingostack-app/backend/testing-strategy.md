# 全仓自动化测试与质量门禁契约

> 本文是 LingoStack 测试体系的可执行总契约。各 package 的断言细节仍以对应 layer spec 为准；桌面测试专用 feature、capability 和 fixture 见 [真实桌面 E2E](./e2e-testing.md)。

## Scenario: 为代码变更选择测试并形成可信证据

### 1. Scope / Trigger

任何产品代码、测试、fixture、依赖、构建脚本、Tauri 配置/capability、CI workflow 或平台实现变更，都必须先按本文判定最小反馈集，并在交付前执行与影响范围匹配的最终门禁。

测试分五层，不能互相冒充：

1. 纯逻辑/单元测试：Rust 内联 tests、Vitest/jsdom。
2. 协议/边界测试：serde 往返、wiremock、流式分片、IPC fixture provider。
3. 构建与静态门禁：lint、TypeScript build、fmt、clippy、Cargo build、生产隔离。
4. 真实桌面 E2E：Windows Tauri 应用、真实 IPC/Channel、确定性 fixture、结果持久化。
5. 系统/平台验收：外部选区、全局快捷键、真实扬声器，以及目标平台占位/实装验证。

### 2. Signatures

#### 安装与前端门禁

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

#### Rust 快速反馈与全仓门禁

```bash
cargo test -p <affected-package>       # 开发中快速反馈
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
```

#### 应用集成、生产隔离与发行构建

```bash
cargo test -p lingostack-app --features e2e
pnpm test:production-isolation
pnpm test:e2e
cargo build --release -p lingostack-app
```

#### CI 静态检查与运行入口

```bash
pnpm exec prettier --check .github/workflows/ci.yml
git diff --check
```

CI 运行契约：`.github/workflows/ci.yml` 包含三平台 `rust`、Ubuntu `frontend`、Windows `e2e-windows`。`audit.yml` 是安全审计，不替代功能测试；`dco.yml` 是治理检查，不替代质量门禁。

### 3. Contracts

#### 测试归属

| 被测对象                | 测试位置与手段                              | 必须证明                                                |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Rust 纯函数/serde/error | 源文件底部 `#[cfg(test)] mod tests`         | 正常、边界、错误；serde 类型往返与默认值                |
| LLM HTTP/provider       | `lingostack-llm` 内联 `wiremock`            | 请求形状、鉴权、状态错误、流错误；无真实 key/网络       |
| SSE/JSON 分帧           | 解码器内联分片测试                          | 最坏切分、非法 UTF-8、上游错误、终止行为                |
| React/store/lib         | 相邻 `*.test.ts[x]` + Vitest/RTL            | 用户可观察状态与语义，不断言 Tailwind class/内部实现    |
| Tauri IPC/Channel/配置  | feature-gated fixture 单测 + WDIO E2E       | 真实 command/Channel、成功/错误/重试、隔离配置          |
| Tauri 测试面隔离        | `test:production-isolation` + release build | 默认依赖图、生产 capability/config、普通前端产物无 WDIO |
| Windows 原生能力        | Rust 结构测试 + `docs/testing.md` 手工清单  | 自动化只证明不 panic/线程/错误形状；物理结果单独记录    |

新增测试必须确定性：不得依赖真实 LLM Key、互联网、开发者配置、上次运行的 IndexedDB 或人工点击。测试数据用显式 fake 值；诊断中不得泄漏 secret。

#### 证据等级

交付汇报必须使用以下措辞之一：

| 等级          | 可声明内容                                    |
| ------------- | --------------------------------------------- |
| planned       | 已写入计划，尚未执行                          |
| static        | 源码/YAML/类型/格式检查通过，未启动目标运行时 |
| local-runtime | 在当前 OS 实际运行并记录退出码/场景/工件      |
| ci-runtime    | 对应 GitHub-hosted runner job 实际完成        |
| manual-system | 人工观察外部应用、系统快捷键或物理音频结果    |

Windows 本机 E2E 通过不能写成 GitHub-hosted Windows 已通过；官方支持 Linux/macOS 不能写成本仓库在两平台已运行。

#### 最终门禁选择

- 小范围开发中可以先跑受影响 package；交付前若改动跨 package、共享依赖、workspace Cargo、Tauri 装配或 CI，则跑全仓门禁。
- 改纯前端逻辑：`pnpm lint + test + build`。
- 改 Rust crate：package test + fmt/clippy；跨 crate 或交付前跑 workspace test/build。
- 改 IPC、Tauri、配置持久化、关键桌面流程或 E2E infrastructure：再加 feature test、production isolation、真实 E2E、release build。
- 改平台原生能力：再加目标平台运行或明确记录“需目标平台/人工验收”。

### 4. Validation & Error Matrix

| 变更/条件                | 最小必跑                                      | 失败或缺证据时的结论                                  |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------- |
| TS 纯函数/store          | `pnpm lint && pnpm test && pnpm build`        | 任何失败都不能交付；jsdom 不能声明桌面运行通过        |
| React 交互/a11y          | 上述命令 + RTL 语义断言                       | 无键盘/ARIA 断言时不能声明可访问性已覆盖              |
| Rust 纯逻辑/serde        | package test + fmt/clippy                     | 公共 API 无正常/边界/错误测试即不完整                 |
| LLM 请求/响应            | `cargo test -p lingostack-llm`                | 用真实网络/key 或漏 wiremock/分片错误测试即失败       |
| IPC/config/Tauri 装配    | app feature test + production isolation + E2E | 只跑单测不能证明真实往返；E2E 绿但隔离红仍失败        |
| Cargo feature/capability | production isolation + E2E + release build    | 测试插件/bridge/ACL 进入默认生产路径即失败            |
| selection/TTS/hotkey     | package/workspace test + Windows 清单         | 自动测试绿只能声明结构通过，不能声明外部选区/出声成功 |
| CI YAML                  | Prettier/static review；最终看 CI run         | 本地静态通过不能声明 GitHub-hosted runner 通过        |
| Linux/macOS 未运行       | 三平台 Rust CI 或目标平台运行                 | 只能报告静态/官方支持；不得报告 runtime pass          |

所有命令必须保留原退出码。测试失败后允许上传工件，但 `always()` 只能用于诊断步骤，不能吞掉主测试失败。

### 5. Good / Base / Bad Cases

- **Good**：先跑受影响 package 快速反馈，最终按触发矩阵跑全量；报告写明 OS、命令、测试场景、退出码、工件和未执行平台。
- **Base**：纯文档/spec 变更只跑格式、链接/内容核对和 `git diff --check`；不得声称业务 runtime 被重新验证。
- **Bad**：把 `cargo check`、源码搜索或 YAML 格式检查写成测试/CI 已通过。
- **Bad**：为了稳定而 mock 自己的 store/业务模块，或让桌面 E2E 绕过真实 IPC/Channel。
- **Bad**：写死“现有 N 个测试”作为契约；数量会漂移，应约束场景、断言和命令。
- **Bad**：系统环境没有语音引擎时把提前返回的 TTS 结构测试写成“真实扬声器已出声”。

### 6. Tests Required

#### 全量自动化交付门禁

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm test:production-isolation
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
cargo build --release -p lingostack-app
```

触发桌面边界时追加：

```bash
cargo test -p lingostack-app --features e2e
pnpm test:e2e
```

桌面 E2E 至少断言启动/导航、真实 IPC/Channel 成功、错误后重试、设置持久化、结果收藏；结束后应用进程为 0、embedded 端口无 listener，并生成 JUnit/WDIO 日志。详细断言见 [真实桌面 E2E](./e2e-testing.md)。

各层专用断言：

- core：serde 往返、缺字段默认值、模型解析错误、Prompt 占位符/语义探针、热键冲突。
- llm：wiremock 请求形状/鉴权/状态错误，SSE/JSON 最坏分片和 secret 擦除。
- selection/tts：trait/error/平台占位，Windows 不 panic与线程/死锁结构；物理结果单独验收。
- hook：加速器顺序/合法性、托盘判定纯函数；活 `AppHandle` 行为由桌面/手工边界补充。
- docparse：当前只有占位 smoke；开始实装时必须换成真实 fixture 与畸形文件用例。
- app frontend：RTL role/name/ARIA、store 成功/错误/迟到事件、IndexedDB 边界；关键桌面链路由 E2E 补充。

### 7. Wrong vs Correct

#### Wrong

```text
检查了 ci.yml 语法，因此 Windows CI 已通过。
cargo test --workspace 通过，因此真实扬声器、外部选区和全局快捷键均正常。
Vitest mock 了 chatStream，因此 Tauri IPC/Channel 已覆盖。
```

#### Correct

```text
ci.yml 通过静态格式检查；GitHub-hosted Windows 尚待实际 job 证据。
workspace Rust 测试证明平台实现不 panic/结构自洽；物理音频与外部选区按 Windows 清单验收。
Vitest 覆盖 store 状态机；WDIO E2E 通过 feature-gated fixture 覆盖真实 IPC/Channel。
```

## 当前已知覆盖缺口

- `lingostack-docparse` 仍是占位 crate，smoke 不代表解析能力。
- `lingostack-hook` 的 live `AppHandle` 托盘/窗口副作用无直接单测。
- `lingostack-app` 并非所有 `#[tauri::command]` 都有单元测试；E2E 只覆盖当前关键链路。
- 前端 `favorites-db.ts` / `favorites-store.ts`、部分 views/ui 原语仍缺直接 Vitest；E2E 不能替代全部组件/DB 单测。
- WebDriver 不证明跨应用选区、系统快捷键或物理音频；Linux/macOS embedded E2E 也尚无本仓库 runtime 证据。

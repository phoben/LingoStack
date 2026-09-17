# Issue 24 实施计划

> 状态：accepted。实现与 Windows 本机验收已完成；用户已于 2026-09-18 授权提交、推送、创建 PR，并要求按合并后自动关闭 Issue #24 的方式结束远端交付。

## Phase A — domain and catalog

- [x] A1. 在 `lingostack-core` 引入新 schema、`ProviderInstance`、`Protocol`、auth、模型能力、来源和 generation 类型；保持 core 无 Tauri 依赖。
- [x] A2. 实现 schema 版本校验与清晰的旧配置不兼容错误；同步默认配置。
- [x] A3. 实现静态 provider catalog、首批预设、实例化和 discovery 资格判定。
- [x] A4. 实现模型发现非破坏性 merge 与 `resolve_request(feature)` 后端不变量。
- [x] A5. 增加 core 正常/边界/错误、serde 往返、catalog 唯一性和 secret Debug 测试。
- [x] Gate A：`cargo test -p lingostack-core` 通过 50 项；core 依赖树未发现 `tauri`。

## Phase B — protocols and model discovery

- [x] B1. 扩展 `ChatRequest` 的规范化 generation options，并让现有 Chat/Anthropic/Gemini adapter 只映射明确支持字段。
- [x] B2. 新增独立 OpenAI Responses adapter 与具名 SSE 事件解析。
- [x] B3. 新增单入口 discovery module：OpenAI style、Anthropic pagination、Gemini、Ollama tags。
- [x] B4. 保持 Ollama 聊天走 OpenAI compatibility，不引入 native `/api/chat` adapter。
- [x] B5. 为每个变更的请求/响应、分页、错误、空结果、坏 JSON、传输错误和 secret 擦除补 wiremock/分片测试。
- [x] Gate B：`cargo test -p lingostack-llm` 通过 63 项。

## Phase C — Tauri and IPC

- [x] C1. 用 protocol 重写 provider factory；普通聊天、术语解释与文档翻译统一消费 `resolve_request`。
- [x] C2. 新增并注册 `list_provider_presets`、`instantiate_provider_preset`、`discover_provider_models`。
- [x] C3. 更新配置读写的 schema 错误、E2E override/fixture 与应用层 factory 测试。
- [x] C4. 同步 `src/lib/config-types.ts`、`src/lib/ipc.ts`、`fixtures/ipc-contract.json`，添加 TS 契约断言。
- [x] Gate C：`cargo test -p lingostack-app --features e2e` 通过 39 项（含 updater binary）；相关前端契约测试纳入 264 项全量 Vitest。

## Phase D — settings UX

- [x] D1. 将 provider catalog/merge/filter/control 判定提取为前端纯函数并覆盖 Vitest。
- [x] D2. 重构内联 ProviderForm：自定义置首、预设实例化、可编辑端点/auth、Key 条件必填。
- [x] D3. 实现显式模型刷新、多选、手工补充、失败保留和来源展示。
- [x] D4. 实现模型规格覆盖、未核验标记、功能能力编辑与参数支持展示。
- [x] D5. 功能模型候选按能力过滤，并在各功能行显示受支持的 generation controls。
- [x] D6. 补齐 loading/success/empty/error 的 `aria-live`、`aria-busy`、`role=alert` 与中英文文案；维持单层分割线布局。
- [x] D7. 扩展 SettingsView/ProviderForm RTL，覆盖 AC1、AC2、AC6–AC11。
- [x] Gate D：`pnpm lint`、`pnpm test`（264 项）、`pnpm build` 均通过。

## Phase E — integration, docs, full verification

- [x] E1. 更新 `docs/lingostack-design.md` 的协议、配置模型、设置场景和测试矩阵。
- [x] E2. 更新真实桌面 E2E fixture/用例，覆盖预设保存、模型分配与 Responses stream。
- [x] E3. `cargo fmt --all --check` 通过。
- [x] E4. `cargo clippy --all-targets -- -D warnings` 通过。
- [x] E5. `cargo test --workspace` 与 `cargo build --workspace` 通过。
- [x] E6. `pnpm test:production-isolation` 与 `pnpm test:e2e` 通过。
- [x] E7. `git diff --check` 通过；新增范围未检出疑似真实 key/Bearer 值，错误与 Debug 脱敏测试通过。
- [x] E8. 本地证据分层已记录；Linux/macOS、真实第三方账号和供应商额度未运行。
- [x] Final gate：AC1–AC13 均有自动化或 Windows 本机运行证据；远端 Issue 生命周期已获提交、推送与 PR 授权，Issue 保持 OPEN 直至 PR 合并后自动关闭。

## Phase F — 模型可输入多选与保存一致性修复

- [x] F1. 先补 RTL 回归：勾选发现模型后直接保存，重新编辑及再次刷新仍为已选；旧实现按预期无法找到融合式 option。
- [x] F2. 将模型输入框与“刷新模型”按钮调整为同一行，刷新状态仅禁用按钮并保留输入。
- [x] F3. 将发现结果放入模型输入框的可输入多选下拉列表；选择候选直接更新当前表单模型集合，手工输入与多个模型能力继续保留。
- [x] F4. 移除独立复选框结果区、“添加所选模型”按钮及 `selectedDiscovered` 双重状态；已选态统一从当前模型 ID 集合派生。
- [x] F5. 覆盖键盘展开/选择、自定义输入、重复候选去重、刷新失败保留、保存后重开与再次刷新回显；同步中英文文案和可访问性语义。
- [x] Gate F. `pnpm vitest run src/components/views/settings-view.test.tsx`（19 项）、`pnpm test`（267 项）、`pnpm lint`、`pnpm build` 与真实 Tauri 设置页交互通过。

## Risky files / rollback points

- `crates/lingostack-core/src/config.rs`、新 catalog/policy 文件：schema 与后端资格判断；完成 Gate A 后再进入协议层。
- `crates/lingostack-llm/src/*.rs`：请求计费、流式与 secret；完成 Gate B 后再接入 Tauri。
- `src-tauri/src/commands.rs`、`src-tauri/src/config.rs`：所有 AI 调用和配置落盘；完成 Gate C 后再改 UI。
- `src/lib/config-types.ts`、`fixtures/ipc-contract.json`：手写 IPC 镜像，必须与 Rust 同一阶段提交。
- `src/components/settings-ai.tsx`、`provider-form.tsx`：用户配置入口；保存失败必须保持草稿。

若阶段失败，先回退该阶段未提交改动，不跨阶段补丁式绕过。不得使用 `git reset --hard`、`checkout --` 或清理用户现有脏工作区。配置 schema 已明确不兼容；代码回滚不等于配置回滚。

## Before task start

- [x] 用户审阅并明确批准本 PRD、design 与 implement。
- [x] 实施前运行 `trellis-before-dev` 并重新读取 relevant spec indexes。
- [x] 校验 GitHub Issue #24 仍为 OPEN，关联 meta 完整。
- [x] 已确认远端 push、PR、Issue 评论/标签/关闭仍需另行明确授权；本轮未执行。

## Final acceptance evidence

- `static`：schema v2、九个首批预设、协议/鉴权/模型来源与参数映射的 Rust/TypeScript/fixture 镜像已同步；fmt、clippy、lint、build、生产隔离与 diff 检查通过。
- `local-runtime`：Windows 本机 `cargo test --workspace`、E2E feature 测试、264 项 Vitest 与 15 项真实 Tauri E2E 全部通过；E2E 覆盖预设实例化保存回读、模型分配和 Responses fixture 流。
- `ci-runtime`：本轮未提交或推送，因此没有 GitHub-hosted runner 证据。
- `manual-system`：本 Issue 不依赖真实系统选区、快捷键或物理音频验收；真实供应商账号、额度及在线 API 未测试。

### 2026-09-18 设置加载回归

- 真实触发条件：Windows 本机配置仍是 Issue 24 之前的旧 provider schema，缺少 `schema_version`；Rust 按既定不兼容边界返回“请重新配置 AI 提供商”。
- 根因：`SettingsView` 仅凭 `config === null` 判断 loading，吞掉了 `config-store` 已保存的加载错误。
- 修复：加载失败显示 `role="alert"` 与实际错误；仅无错误的等待态显示“正在加载设置…”，不迁移、不覆盖旧配置。
- 证据：新增 RTL 回归先红后绿；前端 267 项测试、lint、build、`git diff --check` 通过；真实 Tauri 调试窗口使用现有旧配置显示明确错误，未再出现永久 loading。

### 2026-09-18 模型输入与发现选择融合

- 根因：发现结果勾选保存在 `selectedDiscovered` 临时数组，保存只读取 `modelsText`；未点击“添加所选模型”时选择会静默丢失。
- 修复：模型输入与刷新按钮同排；发现结果进入同一多选组合框，选择立即更新待保存模型集合，已选态从该集合派生。
- 证据：回归测试先红后绿；聚焦 RTL 19 项、全量前端 267 项、lint、build、`git diff --check` 通过。真实 Tauri 窗口使用当前 DeepSeek 配置刷新后，已保存 `deepseek-flash` 显示为已选，新候选选择会立即进入输入框和详情区；验收后取消编辑，未改动用户配置。

### 2026-09-18 最终交付验收

- 用户确认验收通过，并授权提交、推送、创建正式 PR、结束 Trellis 任务与工作区状态。
- 干净交付工作提交：`176f2344e8da4572d3d9a1a75d0328b97783b383`（`feat: 升级 LLM 提供商架构`，`Refs #24`，含 DCO 签署）；从 `origin/develop` 重放，未夹带本地未交付的 Issue #23、OCR 或 GitHub 生命周期任务。
- 最终复跑通过：`cargo fmt --all --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test --workspace`、`cargo test -p lingostack-app --features e2e`（39 项）、`cargo build --workspace`（使用独立 target 目录避免占用中的调试程序文件锁）、`pnpm lint`、`pnpm test`（267 项）、`pnpm build`、`pnpm test:production-isolation`、`git diff --check`。
- `pnpm test:e2e` 沿用本轮此前通过的 Windows 真实 Tauri 15 项结果；最终复跑未再次占用用户正在运行的调试实例。
- 干净交付分支复跑通过：Rust fmt、Clippy、workspace build/tests、Tauri E2E feature 39 项、前端 lint/build/生产隔离与 257 项基线全量 Vitest；相比原工作区的 267 项，排除了尚未交付的 Issue #23 测试，Issue #24 设置页 19 项保持全量通过。
- PR 使用 `Closes #24`，Issue 在 PR 合并前保持 OPEN，符合生命周期契约；本轮不执行合并。

# Implementation plan

## 1. Baseline and dependency setup

- [x] 记录 `git status`、HEAD、工具版本和现有门禁基线；初始无 `node_modules`，完成依赖接入后执行 `pnpm install --frozen-lockfile` 验证锁文件可复现。
- [x] 添加同一 WDIO 9 版本线的 CLI/local runner/Mocha/spec/JUnit 依赖、`@wdio/tauri-service` 与 guest plugin，更新 `pnpm-lock.yaml`。
- [x] 添加两个可选 Rust 插件与 `e2e` Cargo feature，更新 `Cargo.lock`；确认默认 `cargo tree -p lingostack-app` 不含它们。

## 2. Test-only application assembly

- [x] 增加 E2E capability 和 Tauri config overlay；生产 config 显式只选 `default`。
- [x] 在 `src-tauri/src/lib.rs` 仅按 `e2e` feature 注册 WDIO 插件，保持原启动顺序。
- [x] 增加 E2E-only 配置路径覆盖，并让 managed state/setup 共用解析后的路径；补 Rust 单元测试覆盖 feature 下的有效 override。
- [x] 增加 feature-gated deterministic `LlmProvider`，覆盖分块成功、确定性错误和错误后重试成功；补 Rust 测试证明没有 HTTP/API Key 依赖。
- [x] 仅在 E2E Vite mode 加载 guest plugin；为执行翻译与设置模型补稳定可访问名称。

## 3. Runner, fixtures, and scenarios

- [x] 新增 `wdio.conf.ts`、E2E TypeScript 配置、fixtures/helpers/specs 和 `artifacts/e2e` 忽略规则。
- [x] 实现跨平台 Node 启动包装：创建隔离配置/临时目录，构建 feature-enabled 测试应用，运行 WDIO，转发退出码，并在 finally 中清理临时配置。
- [x] 实现 startup/navigation、translation success、translation error/retry、settings persistence、favorite result 五类真实桌面场景。
- [x] 配置 JUnit、runner/service/app logs 与失败截图；确保失败输出路径稳定且不包含 API Key。

## 4. Production isolation and CI

- [x] 增加 `test:e2e`、按需的 `test:e2e:build`/`test:e2e:run` 与自动化生产隔离检查脚本。
- [x] 在 `.github/workflows/ci.yml` 增加唯一的 Windows embedded E2E blocking job 与 always artifact upload，不复制现有 Rust/frontend job。
- [x] 人工复核 CI action expressions、缓存和 artifact 路径；本机未执行 GitHub-hosted Windows runner。

## 5. Documentation and native boundary

- [x] 新增测试文档并从 README 链接：本地依赖/命令、CI、工件、故障排查、重复运行、生产隔离。
- [x] 写出 Windows 外部选区/全局快捷键/剪贴板降级/真实 TTS 的可执行手工验收步骤，并明确 WebDriver 不覆盖的物理/跨应用边界。
- [x] 记录 Linux/macOS 为官方支持但本任务未真实运行，不声称通过。

## 6. Validation and review gates

- [x] `pnpm lint`（通过）
- [x] `pnpm test`（通过：13 files / 123 tests）
- [x] `pnpm build`（通过）
- [x] `cargo fmt --all --check`（通过）
- [x] `cargo clippy --all-targets -- -D warnings`（通过）
- [x] `cargo test --workspace`（通过：当前 Windows，113 tests）
- [x] `cargo build --workspace`（通过：当前 Windows）
- [x] `cargo build --release -p lingostack-app`（通过）
- [x] 自动化 production-isolation check（通过；WDIO crate、capability 与 guest bundle 均不进入生产路径）
- [x] CI YAML 格式静态检查（`pnpm exec prettier --check .github/workflows/ci.yml` 通过；未在 GitHub-hosted runner 真实运行）
- [x] `pnpm test:e2e` 连续两次（均通过：5/5）；最后一次先执行 `cargo clean -p lingostack-app` 强制验证 feature build script，退出后确认 `lingostack-app-processes=0`、4445 无 listener 且可重新绑定，JUnit 报告已生成
- [x] 运行 `trellis-check` 全范围评审；修复 production bridge、feature capability codegen、E2E 单实例冲突和日志工件路径后重跑受影响检查与完整门禁。

### Final verification evidence (2026-08-14, Windows)

- `pnpm lint` — 通过。
- `pnpm test` — 通过，13 files / 123 tests。
- `pnpm build` — 通过。
- `pnpm test:production-isolation` — 通过：默认 Cargo 图不含 WDIO，生产配置不暴露 global Tauri bridge 或 WDIO capability，普通前端产物不含 guest bridge。
- `cargo fmt --all --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test --workspace`、`cargo build --workspace`、`cargo build --release -p lingostack-app` — 均通过。
- `cargo test -p lingostack-app --features e2e` — 通过，14 tests。
- `pnpm test:e2e` — 最终通过：WDIO embedded provider 的 1 spec / 5 场景；`artifacts/e2e/` 含 JUnit 与 WDIO 日志。运行完成后 4445 无 listener。另一个工作树已有的生产 LingoStack 进程未由本任务触碰；E2E 测试 binary 以独立 identifier 启动，实测不会触发其单实例退出。

## Risky files and rollback points

- `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, capabilities：任何默认路径启用 WDIO 即停止并回滚到显式 feature/capability allow-list。
- config path override：若非 E2E 构建可观察到 override，视为生产隔离失败并回滚。
- fixture provider 工厂：若非保留 fixture 配置也能选中 mock，视为业务行为泄漏并回滚。
- `.github/workflows/ci.yml`：若新增 job 重复既有门禁或丢失原检查，恢复原 job 后重新做最小独立扩展。

## Planning review gate before `task.py start`

- [x] PRD、design、implement 三份文档完整且职责分离。
- [x] 用户目标、范围、排除项、可观察验收和平台证据边界明确。
- [x] 官方资料与仓库研究已写入 `research/`。
- [x] `implement.jsonl` 与 `check.jsonl` 各有真实 spec/research 条目且 `task.py validate` 通过。
- [x] 最新规划摘要已交给用户，并在后续消息获得明确实施批准（2026-08-14）。

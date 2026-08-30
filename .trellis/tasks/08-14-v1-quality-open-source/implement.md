# 实施计划：质量与开源门禁

- [x] 1. 增加 Rust/TS 共享 fixture 或等价契约测试，覆盖配置默认/迁移与事件形状，保证任一镜像漂移会使门禁失败。
- [x] 2. 以现有测试为基线，只补 `FavoritesView`、最终 hotkey/selection/TTS 状态与其他经审计确认的语义缺口，不重复 DB/store/config/theme 已有用例。
- [x] 3. 在现有五个 WDIO 场景上补齐词条 tag、命名五乘五、热键冲突恢复及可 mock 的划词/TTS 状态；复核诊断工件、重复运行清理和 production isolation。（2026-08-30 Windows JUnit 10/10；热键和划词通过只在 `e2e` feature 注册的后端事件 command 驱动真实前端监听，TTS 验证 speak/stop 可观察状态。生产隔离检查通过。）
- [x] 4. 配置 cargo-about、pnpm license JSON 合并脚本与确定性 `THIRD_PARTY_NOTICES`。（锁定 cargo-about 0.9.2 CLI；产物覆盖 Rust 与 pnpm production 依赖，连续两次本地生成无差异。）
- [x] 5. 将 notices 漂移校验接入 CI，复核 DCO/Dependabot/audit/模板与现有 Windows E2E job 仍有效。（Ubuntu CI 使用锁定工具执行生成与 `git diff --exit-code -- THIRD_PARTY_NOTICES`；远程 CI 尚未运行。）
- [ ] 6. 执行 Windows 手工场景、可听 SAPI/原生托盘确认、延迟和资源测量，将证据写入任务目录。（`manual-validation.md` 已有外部划词、剪贴板降级、单实例和资源实测；SAPI 实际可听性、原生托盘菜单操作需人工确认，付费 provider HTTP 402 阻断延迟测量。）
- [ ] 7. 运行最终全量本地门禁和受支持平台 CI，修复回归并提交，再进入父任务跨子任务验收。（本地门禁已通过；工作提交为 `f68c47b`、`6edce94`、`b9dfd30`、`7fc5c64`，尚未推送或运行远程三平台 CI。）

## Validation

```powershell
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
pnpm licenses list --json --prod
pnpm notices:generate
git diff --exit-code -- THIRD_PARTY_NOTICES
```

## Rollback

E2E 插件必须 feature-gated；若 CI 驱动不稳定，只回退/隔离 E2E job，不删除功能级单测。许可证生成失败时不手工编辑产物掩盖工具问题，回退生成器配置并保留现有治理门禁。

# 实施计划：质量与开源门禁

- [ ] 1. 增加 Rust/TS 共享 fixture 或等价契约测试，覆盖配置默认/迁移与事件形状。
- [ ] 2. 补 Favorites DB/store/view、设置、translation tag、TTS/selection 状态的测试缺口。
- [ ] 3. 评审并集成 `tauri-e2e-ci` 独立工作树交付的 feature-gated WebdriverIO Tauri service、Windows E2E 脚本、mock 与 CI job；本任务不从零重复搭建。
- [ ] 4. 在已集成基础上补齐最终 V1 核心 E2E 场景与断言，验证失败截图/日志和 Windows CI 独立 job。
- [ ] 5. 配置 cargo-about、pnpm license JSON 合并脚本与确定性 `THIRD_PARTY_NOTICES`。
- [ ] 6. 将 notices 漂移校验接入 CI，复核 DCO/Dependabot/audit/模板仍有效。
- [ ] 7. 执行 Windows 手工场景、延迟和资源测量，将证据写入任务目录。
- [ ] 8. 运行最终全量门禁和三平台 CI，修复回归并提交。

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

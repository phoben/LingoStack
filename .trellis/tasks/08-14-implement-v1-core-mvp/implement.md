# V1 核心 MVP 实施计划

## 执行顺序

- [x] 1. 启动并完成 `08-14-v1-translation-intelligence`：固化跨层协议、语言规则、词条 tag、重试/429 与命名五候选。
- [x] 2. 全量门禁通过并提交子任务 1；若 IPC/配置契约变化，先同步设计文档与上下文清单。
- [x] 3. 启动并完成 `08-14-v1-settings-localization-hotkeys`：实现设置、双语、主题和热键恢复。
- [x] 4. 全量门禁通过并提交子任务 2。
- [ ] 5. 启动并完成 `08-14-v1-desktop-result-actions`：补齐划词反馈、托盘路由、TTS 停止和结果动作。
- [ ] 6. 全量门禁通过并提交子任务 3，并在 Windows 做 UIA/SAPI 手工验证。
- [ ] 7. 待 `tauri-e2e-ci` 独立工作树产出完成评审并进入本分支后，启动 `08-14-v1-quality-open-source`：在既有 E2E 基础上补齐 V1 场景、测试、许可证通知和集成门禁；不得在前三个功能子任务中重复搭建 E2E/CI。
- [ ] 8. 对父任务执行跨子任务验收，修订 `docs/lingostack-design.md` 中残留的旧 PopClip/独立解释表述。
- [ ] 9. 运行最终质量检查，记录 Windows 运行证据，按逻辑范围提交并归档四个子任务与父任务。

## 父级验收命令

```powershell
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
python ./.trellis/scripts/task.py validate .trellis/tasks/08-14-implement-v1-core-mvp
```

三平台编译/测试以 GitHub Actions 矩阵结果为准；当前 Windows 环境执行 `pnpm tauri dev` 和桌面 E2E，记录热键划词、剪贴板降级、朗读/停止、设置持久化的实际结果。

## 评审门禁

- 每个子任务只能在其 `prd.md`、`design.md`、`implement.md` 与 JSONL 上下文齐备后启动。
- 子任务按顺序推进；依赖未完成时，不在后续子任务预埋临时代码。
- 每次跨 IPC 类型改动必须同时验证 Rust serde、TypeScript 镜像和一次真实 Tauri 往返。
- 不把 mock E2E、静态阅读或 CI 编译表述成真实 UIA/SAPI 运行证据。

## 回滚点

- 子任务 1：可整体回退到当前纯文本流；不得留下半套 sentinel 或不兼容配置。
- 子任务 2：配置迁移必须可重复；回退时保留旧配置可读性。
- 子任务 3：不得改变 Windows TTS 常驻线程与 selection 两级降级模型。
- 子任务 4：测试/治理依赖与功能提交分开，E2E 不稳定时先隔离 job，不删除已有门禁。

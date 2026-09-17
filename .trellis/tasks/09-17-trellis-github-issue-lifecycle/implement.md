# 实施计划：Trellis 条件式 GitHub Issue 交付兼容

- [x] 新增 `.trellis/spec/guides/github-issue-lifecycle.md`，定义触发元数据、阶段行为、授权矩阵与关闭条件。
- [x] 更新 `.trellis/spec/guides/index.md`，使新契约可发现并增加触发清单。
- [x] 更新 `.trellis/workflow.md` 的请求分类、Phase 1、Phase 3 与 workflow-state 提示，使关联逻辑只在显式元数据存在时触发。
- [x] 更新 `AGENTS.md` 与 `CLAUDE.md`，统一引用生命周期契约。
- [x] 保留 `docs/agents/issue-tracker.md` 作为 Matt/GitHub 命令事实来源，不复制命令清单。
- [x] 检查未修改 `.trellis/scripts/**`、`.trellis/config.yaml`、内置 skills 或 lifecycle hooks。
- [x] 运行 `pnpm exec prettier --check` 覆盖本次 Markdown，运行 `git diff --check`。
- [x] 运行 `task.py validate` 并由 `trellis-check` 做最终一致性检查。

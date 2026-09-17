# Trellis 条件式 GitHub Issue 交付兼容

## Goal

让本项目的 Trellis 工作流只在任务显式关联 GitHub Issue 时兼容 Matt triage 形成的 Issue 与 agent brief，并在本地提交、远端交付和 Issue 关闭之间保留清晰边界。

## Requirements

- 普通需求沿用现有 Trellis 流程，不读取或修改 GitHub Issue。
- 仅以 `task.json.meta.source_kind=github_issue` 作为 Issue 管理触发条件，不从标题、slug 或自然语言编号猜测关联。
- 关联任务保存 GitHub 仓库、Issue 编号和 URL 等身份字段；可变化的标签与开关状态必须实时查询，不写入任务元数据作为事实。
- Phase 1 读取关联 Issue、评论、标签与 Matt agent brief，并将需求边界带入 Trellis 任务工件。
- 实现与检查继续使用 Trellis 自身流程，不要求调用 Matt `/implement`。
- 本地提交不等于远端交付；未获得远端授权时必须明确报告 GitHub 同步待处理。
- GitHub 评论、标签、push、PR 与关闭均受明确远端授权约束；关闭前必须确认代码进入默认分支且必要验收已完成。
- 保持 Matt 的 category/state 标签语义，不擅自新增互斥的 `in-progress` 状态。
- 不修改 Trellis 脚本、生命周期 Hook、全局安装目录、`node_modules` 或内置 Matt/Trellis skills。

## Acceptance Criteria

- [ ] `.trellis/workflow.md` 在计划、执行/提交和收尾提示中包含显式且条件化的 Issue 关联规则。
- [ ] 新增项目级 GitHub Issue 生命周期 spec，并从 guides 索引可发现。
- [ ] `AGENTS.md` 与 `CLAUDE.md` 都引用同一份项目契约，不复制两套详细规则。
- [ ] 契约明确普通任务完全跳过、关联元数据只保存身份、本地提交不触发远端写入。
- [ ] 契约明确 push、PR、评论、标签和关闭的授权与验收边界。
- [ ] 不新增脚本、Hook 或项目本地交付 skill。
- [ ] Markdown 格式检查、Trellis 任务校验和差异检查通过。

## Notes

- 研究依据见 `docs/research/trellis-matt-github-issue-compatibility.md`。
- 本任务自身不是 GitHub Issue 来源，因此 `meta` 保持为空，用于验证普通任务不会被误关联。

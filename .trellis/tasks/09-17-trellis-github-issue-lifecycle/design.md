# 设计：Trellis 条件式 GitHub Issue 交付兼容

## 设计边界

本次只建立文本契约和工作流路由，不实现程序化同步器。`.trellis/workflow.md` 决定何时触发；`.trellis/spec/guides/github-issue-lifecycle.md` 保存详细、可复用的执行契约；`AGENTS.md` 与 `CLAUDE.md` 只提供发现入口。

## 关联模型

任务只有在 `task.json.meta.source_kind` 严格等于 `github_issue` 时才进入 Issue 分支。身份字段为：

- `github_repo`
- `github_issue`
- `github_issue_url`

标签、open/closed、assignee、默认分支和 PR 合并状态均属于远端实时事实，不在 `meta` 中缓存为权威状态。

## 生命周期

1. Phase 1 创建或接管任务时写入身份元数据并只读拉取 Issue 全量上下文。
2. Phase 2 继续走 Trellis implement/check；默认不写 GitHub。
3. Phase 3 本地提交使用 `Refs #<n>` 建立追溯，但不使用 closing keyword。
4. 获得明确授权后才执行 push/PR/Issue 写入，并在操作后回读远端。
5. 只有默认分支已包含变更、验收边界满足且关闭动作已授权时才关闭；未合并 PR 只评论和关联。
6. 普通任务从头到尾跳过上述所有 GitHub 分支。

## 与 Matt 的边界

Matt `/triage` 提供 Issue 分类、状态标签与 agent brief；Trellis 消费这些输入，但不假设 Matt `/implement` 已运行。Trellis 不发明新的 Matt state role，完成状态由 GitHub 的 closed 状态表达。

## 安全与失败语义

- 实施批准不隐含任何远端写权限。
- 本地 commit、Trellis archive、测试通过均不能单独证明远端交付。
- 不使用 lifecycle hook，避免非阻断 hook 失败造成“本地已完成、远端未同步”的假象。
- Issue 已关闭、关联元数据不完整或远端仓库不匹配时停止写入并报告，不自动修复或重新打开。

## 可扩展点

如果未来 GitHub 操作反复出现格式或回读错误，可新增项目本地 `github-issue-delivery` skill；它只能复用本契约，不能改变授权边界。第一版不创建该 skill。

# GitHub Issue 生命周期契约

> 本契约仅约束显式关联 GitHub Issue 的 Trellis 任务。它将 Matt triage 的输入接入 Trellis 工作流，但不替代、调用或依赖 Matt `/implement`。

## 触发条件与非目标

只有任务 `task.json.meta.source_kind` **严格等于** `github_issue` 时，才执行本契约。没有此字段或值不匹配时，任务是普通 Trellis 任务：不得因为标题、slug、提交信息或自然语言出现 `#23` 而读取、评论、改标签或关闭 GitHub Issue。

本契约不新增脚本、lifecycle hook、项目本地交付 skill 或新的 Matt 状态标签；也不把 Trellis 归档当成远端交付证明。

## 关联元数据

创建关联任务时，`meta` 必须只保存下列稳定身份字段：

```json
{
  "source_kind": "github_issue",
  "github_repo": "owner/repository",
  "github_issue": "23",
  "github_issue_url": "https://github.com/owner/repository/issues/23"
}
```

使用现有任务命令写入元数据，不直接修改 Trellis 脚本：

```powershell
python ./.trellis/scripts/task.py set-meta <task> source_kind github_issue
python ./.trellis/scripts/task.py set-meta <task> github_repo owner/repository
python ./.trellis/scripts/task.py set-meta <task> github_issue 23
python ./.trellis/scripts/task.py set-meta <task> github_issue_url https://github.com/owner/repository/issues/23
```

- `github_repo`、`github_issue` 和 `github_issue_url` 缺失、互相不匹配，或目标 Issue 已关闭时，停止远端写入并报告；不得猜测、自动修复或重新打开 Issue。
- 标签、Issue 开闭状态、assignee、默认分支、PR 状态与合并状态都是可变化的远端事实，不写入 `meta`，需要时必须实时查询。
- 任务自身不来自 Issue 时，保持 `meta` 为空或使用与本契约无关的元数据；不要为了统一格式伪造关联。

## 阶段行为

| Trellis 时点       | 关联任务必须做什么                                                                               | 默认允许的 GitHub 操作 |
| ------------------ | ------------------------------------------------------------------------------------------------ | ---------------------- |
| Phase 1 计划       | 只读查询 Issue、评论、标签和 Matt triage 的 agent brief；将范围、验收条件和未决项写入任务工件。  | 读取                   |
| Phase 2 实施与检查 | 继续使用 Trellis `trellis-implement`、`trellis-check` 与常规质量门禁；不要求 Matt `/implement`。 | 无                     |
| 本地提交           | 提交信息使用 `Refs #<github_issue>`，在任务记录中保存提交号；向用户说明远端尚未同步。            | 无                     |
| 用户要求远端交付   | 一次性确认本轮包含的操作范围，再执行对应 push、PR、评论、标签或关闭；每次写入后回读远端结果。    | 仅获授权的操作         |
| 收尾或归档         | 说明是否仍待远端交付；本地检查、commit、archive 都不能代替关闭条件。                             | 无                     |

## 远端授权与回读

“实施”“检查通过”“提交”都不隐含 GitHub 写权限。下表中的每类远端写入都需要用户明确授权其具体动作；可以在一次确认中成组授权多个动作，但得到某一项授权不自动扩展到未列出的其他项。

| 动作          | 执行前确认                                              | 成功后必须回读                                        | 关闭限制                        |
| ------------- | ------------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| Push          | 目标远端与分支                                          | 远端分支与提交可达                                    | 不关闭 Issue                    |
| 创建或更新 PR | 源分支、目标分支与 PR 文案                              | PR URL、目标分支、冲突状态、必需检查与 `Quality Gate` | 未合并 PR 不关闭 Issue          |
| 评论 Issue    | 目标仓库、Issue 号和中文内容                            | 评论已出现在目标 Issue                                | 不关闭 Issue，除非另获关闭授权  |
| 调整标签      | 目标标签及其 Matt role 语义                             | 当前标签集合                                          | 不新增互斥的 `in-progress` 状态 |
| 关闭 Issue    | 默认分支已包含变更、必要验收已完成或已在 Issue 明确接受 | Issue 已关闭且最终评论可见                            | 必须同时具备关闭授权            |

若 Issue 已关闭、远端仓库与 `github_repo` 不符、身份字段不完整，或回读失败，停止后续远端写入并如实报告。不要以本地 Git 状态、缓存标签或工具调用无报错替代回读。

### PR 合并前的远端事实门禁

- 目标分支和 PR 的必需检查必须全部处于成功终态，稳定汇总检查 `Quality Gate` 必须成功；排队、运行中、跳过、取消、失败或缺失都不能视为通过。
- 目标分支最近一次 CI 是红色、取消或未知时，先修复红色基线；不得以“失败早已存在”或“与当前改动无关”为由继续合并。
- merge/rebase/cherry-pick 或任何冲突解决后，本地旧测试与旧 CI 证据失效，必须在新提交图上重新执行完整性检查和受影响门禁。
- GitHub ruleset/branch protection 是强制层，不替代人工回读；远端写入获授权后，仍需读取 PR mergeability、必需检查集合及其最终结论再继续。

## Matt triage 的兼容边界

Matt `/triage` 产出的分类标签、状态标签和 agent brief 可以作为关联任务的需求输入。Trellis 只消费这些输入：实施与质量检查仍走 Trellis 自身流程，不假设也不要求调用 Matt `/implement`。

保留 Matt 的标签语义：仅在已明确授权时调整既有 category/state label，并保持一个 state role。项目没有定义非互斥进度标签时，不额外创建或添加 `in-progress`；完成状态由 GitHub Issue 的关闭状态表达。

## 中文交付评论的最小内容

在获得评论授权后，评论使用中文，并说明：可观察的业务结果、提交或 PR 链接、已运行的验证及其结果、仍未完成的人工/部署验收。不得包含 API Key、日志中的敏感字段或其他秘密。

推荐结构：

```markdown
已完成：<用户可观察结果>。

交付：<提交 SHA 或 PR 链接>。
验证：<命令与结果>。
待确认：<人工验收或部署边界；没有则写“无”>。
```

## 命令事实来源

GitHub CLI 的读取与写入命令以 [Issue tracker 说明](../../../docs/agents/issue-tracker.md) 为准。本契约定义何时可以做什么，不复制命令清单，也不授予额外远端权限。

# Trellis 与 Matt GitHub Issue 生命周期兼容性调研

> 调研日期：2026-09-17  
> 范围：仅评估项目内允许的定制面；不修改 Trellis 脚本、全局安装目录或 `node_modules`。

## 结论

推荐将“GitHub Issue 交付同步”定义为 **仅对已显式关联 Issue 的 Trellis 任务生效的项目工作流契约**，而不是 Trellis 的通用任务状态机，也不是 Matt `/implement` 的替代品。

实现时以三层配合：

1. 在任务 `task.json.meta` 明确记录关联来源；没有该标记的任务一律不触发 GitHub 管理。
2. 在 `.trellis/workflow.md` 的计划、开始实施和交付阶段加入必经检查点；它负责让 AI 在正确时机询问、记录和汇报。
3. 用项目本地 spec（必要时再用项目本地 skill）规定 GitHub 读取、评论、标签、推送、PR 和关闭的授权与文案。

不建议使用 `.trellis/config.yaml` 的生命周期 hook 自动评论、改标签或关 Issue。hook 失败只告警、不阻断任务；而这些操作都是不可由本地任务完成推断出的远端写入，尤其不能将“任务已归档”误等同于“已经部署或合并到默认分支”。

这套方案兼容 Matt 的 `/triage`：由 triage 产出的 `ready-for-agent` 和 agent brief 仍是 Issue 的需求入口；实际编码与检查仍走 Trellis 的实现/检查流程。它**不要求也不假设调用 Matt `/implement`**。

## 已验证的本地能力与约束

| 事实                                                                                                                                                             | 证据                                                                                                                                     | 对方案的影响                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 任务元数据允许扩展 `meta`，且 `task.py create --meta key=value`、`set-meta` 已提供入口。                                                                         | [TaskData](../../.trellis/scripts/common/types.py) 的 `meta` 字段；`task.py create --help`、`task.py set-meta --help`。                  | 无需改 schema 或脚本即可保存 Issue 身份。                                                          |
| 当前任务系统已有 `commit`、`pr_url`、`branch`、`base_branch` 字段，但当前 Issue 23 任务的 `meta` 为空。                                                          | [任务样例](../../.trellis/tasks/09-17-issue-23-ai-settings-sidebar-ux/task.json)。                                                       | 现有任务无法让后续步骤可靠知道它对应 GitHub Issue。                                                |
| Trellis 当前执行路径是 `trellis-implement → trellis-check → trellis-update-spec → commit → finish-work`；其中 `trellis-implement` 是 agent 类型而非 Matt skill。 | [工作流第 236–251 行](../../.trellis/workflow.md)。                                                                                      | 要在 Trellis 的计划/收尾节点植入兼容规则，不能声称本次调用了 Matt `/implement`。                   |
| Trellis Phase 3.4 明确“提交但不推送”。                                                                                                                           | [工作流第 600–650 行](../../.trellis/workflow.md)。                                                                                      | 本地 commit 不是 GitHub Issue 完成依据；远端同步必须为独立、明确授权的阶段。                       |
| `config.yaml` 支持 `after_create/start/finish/archive` hook，但失败只警告，不阻断操作。                                                                          | [配置第 35–51 行](../../.trellis/config.yaml)。                                                                                          | hook 可做本地提示，不能承担可靠的外部交付或关闭行为。                                              |
| Matt triage 对已处理 Issue 规定一个 category role 和一个 state role；`ready-for-agent` 表示 agent brief 已准备好。                                               | [Matt triage skill](C:/Users/NINGMEI/.codex/plugins/cache/mattpocock/mattpocock-skills/1.2.3/skills/engineering/triage/SKILL.md)。       | 不应自行发明第二个互斥状态标签“in-progress”，也不应把 `ready-for-agent` 误改为 `ready-for-human`。 |
| Matt `/implement` 是独立流程，要求 TDD、review、提交；Trellis 的执行代理和它没有自动调用关系。                                                                   | [Matt implement skill](C:/Users/NINGMEI/.codex/plugins/cache/mattpocock/mattpocock-skills/1.2.3/skills/engineering/implement/SKILL.md)。 | 两者是可组合流程，不是彼此隐含的生命周期触发器。                                                   |

## 建议的关联模型

只要需求明确来自 GitHub Issue，就在创建任务时写入以下 `meta`；没有 `source_kind=github_issue` 即视为普通需求，不执行任何 GitHub 读取或写入。任务名称或 slug 中出现 `issue-23` 只能用于展示，不能替代这个显式关联标记。

```json
"meta": {
  "source_kind": "github_issue",
  "github_repo": "phoben/LingoStack",
  "github_issue": "23",
  "github_issue_url": "https://github.com/phoben/LingoStack/issues/23"
}
```

推荐创建命令形态：

```powershell
python ./.trellis/scripts/task.py create "实施 Issue 23：AI 配置与侧栏体验优化" `
  --description "实现已 triage 的 GitHub Issue 23" `
  --slug issue-23-ai-settings-sidebar-ux `
  --meta source_kind=github_issue `
  --meta github_repo=phoben/LingoStack `
  --meta github_issue=23 `
  --meta github_issue_url=https://github.com/phoben/LingoStack/issues/23
```

`meta` 只保存关联身份，不保存 `ready-for-agent`、open/closed 等可变化状态。当前标签与开关状态必须在对应阶段实时查询 GitHub，不能用任务创建时的快照替代。

## 推荐生命周期

| Trellis 时点                                   | 仅关联任务的额外动作                                                          | 允许的 GitHub 动作                                                                       | 不允许推断                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Phase 1 计划                                   | 读取 Issue、评论、标签和 triage brief；把范围、验收和未决项写入 PRD。         | 只读，无需额外远端写授权。                                                               | 不能因 Issue 存在就自动创建任务或开始实施。                       |
| `task.py start` / 用户批准实施                 | 再核对 Issue 仍 open、关联号未漂移；记录本地实施已开始。                      | 默认只读。用户明确要求“同步开始状态”时，才发中文评论。                                   | 不能自动改 Matt state label；没有标准“开发中”状态。               |
| 实现与质量检查完成                             | 将验证命令、结果、人工验收缺口写入任务工件。                                  | 默认无远端写。                                                                           | 不能把测试全绿说成已交付或已关闭。                                |
| 本地 commit                                    | 将 commit SHA 写入任务 `commit` 字段或交付记录。                              | 默认无远端写。                                                                           | 本地 commit 不等于远端可见，不触发评论或关闭。                    |
| push / 创建 PR                                 | 先取得用户对对应远端写操作的明确授权；确认远端分支、PR URL 和目标分支。       | 允许推送或创建 PR；成功后可评论“已推送/PR 已创建”，附 SHA/PR、验证和已知边界。           | 不应在未合并 PR 时关闭 Issue。                                    |
| 已合并到默认分支，或确认 commit 已进入默认分支 | 再读取 GitHub 以确认实际可达性；确认必需人工验收已完成或在 Issue 中明确接受。 | 在用户授权关闭时，发表评论后关闭；或在 PR 描述用 GitHub closing keyword 让合并自动关闭。 | `task.py archive`、本地测试、仅 push 到功能分支均不构成关闭条件。 |

### 评论与标签原则

- 所有 GitHub 评论、标签变更、关闭、push、PR 创建均须在用户的明确远端交付授权范围内；“实施”或“提交”默认不包含这些写入。
- 延续 Matt triage 的标签模型：只改其已有的 category/state label，且一次只保留一个 state role。没有项目已定义的非互斥进度标签时，不添加 `in-progress`。
- 普通需求（无 `source_kind=github_issue`）不可产生 Issue 评论、标签或关闭动作。
- 评论使用中文，包含可观察结果、commit/PR 链接、验证、尚未完成的人工或部署验收；不泄露密钥、日志或内部敏感数据。

## 推荐落地改动（后续另行审批）

### 方案 A：工作流 + spec，推荐

1. 新增 `.trellis/spec/guides/github-issue-lifecycle.md`，固化上面的元数据、触发条件、远端授权矩阵、评论模板和关闭条件。
2. 在 `.trellis/workflow.md` 中同步修改三个位置：
   - Request Triage / Phase 1：识别是否显式关联 Issue；关联时记录 `meta`、读取 triage brief；不关联则跳过。
   - Phase 2 开始：用户批准实施后仅重新核验 Issue；只有另外获得“同步 Issue”授权才写评论或标签。
   - Phase 3.4/3.5：本地 commit 后明确区分“提交完成”与“远端交付”；如用户要求 push/PR/关闭，按顺序读取远端并逐项执行、回读确认。
3. 在 `workflow-state:planning` 和 `workflow-state:in_progress` 中加入同样的条件化提醒，避免规则只写在长文而不进入每轮提示。
4. 对 Codex 的平台入口同步检查；本仓库当前使用工作流注入，修改后需重启会话使新 breadcrumb 生效。

优点：符合 Trellis 的“工作流文本是本地真源、脚本只是解析器”的定制方式，覆盖每个 AI 会话，不引入脚本和凭据依赖。风险：依赖 agent 遵守文本契约，不能像强制程序门禁一样阻止漏同步；通过 task 工件的交付检查表与最终回读降低风险。

### 方案 B：方案 A + 项目本地 skill，适合希望复用固定交付文案时

保留方案 A，再新增 `.agents/skills/github-issue-delivery/SKILL.md`（或项目已有多平台共享位置），仅在 `source_kind=github_issue` 且进入同步节点时调用。skill 负责：读取 metadata、查询 Issue/PR、生成中文评论草稿、逐项请求或核对远端授权、执行后回读。

优点：把易错的 GitHub 交付细节收拢为可复用操作单。风险：它不是自动触发机制，因此 workflow 仍必须保留调用条件；而且需确认当前 GitHub 工具/CLI 已登录。

### 不推荐方案：生命周期 hook 自动同步

尽管 `after_start` 和 `after_archive` 存在，自动 hook 有三个不匹配点：

1. 对所有任务都会触发，难以天然满足“仅关联 Issue”。
2. hook 不阻断主流程，失败时会留下本地已归档、远端未同步的假象。
3. `after_archive` 只说明 Trellis 文件归档，不能证明 PR 已合并、默认分支已包含变更或人工验收完成。

若未来确实需要 hook，只应做无副作用的本地提醒，例如打印“本任务关联 #23，远端同步须显式确认”；不应调用 GitHub 写 API。

## 需要确认的产品决定

落地前只需确认两点：

1. “同步开始状态”是否默认只写任务工件，还是在用户批准实施时也默认要求一次 GitHub 评论？推荐前者，以维持远端写授权的清晰边界。
2. 关闭 Issue 的唯一自动化路径是否限定为“PR 合并至默认分支且 PR 描述带 closing keyword”？推荐是；直接 API 关闭只在用户明确要求时使用。

## 来源

- [本地 Trellis 工作流](../../.trellis/workflow.md)：任务阶段、实施代理、提交不推送、可定制 workflow-state 与 hook 说明。
- [本地 Trellis 配置](../../.trellis/config.yaml)：可用 hook 事件及其失败语义。
- [Trellis 本地定制说明](../../.agents/skills/trellis-meta/SKILL.md) 与其 `references/customize-local/`：本地 workflow、spec、task metadata 是推荐定制面；不要修改全局安装或 `node_modules`。
- [Matt ask-matt](C:/Users/NINGMEI/.codex/plugins/cache/mattpocock/mattpocock-skills/1.2.3/skills/engineering/ask-matt/SKILL.md)：triage 是进入主实施流的 on-ramp。
- [Matt triage](C:/Users/NINGMEI/.codex/plugins/cache/mattpocock/mattpocock-skills/1.2.3/skills/engineering/triage/SKILL.md)：Issue role/state 与 agent brief 规则。
- [Matt implement](C:/Users/NINGMEI/.codex/plugins/cache/mattpocock/mattpocock-skills/1.2.3/skills/engineering/implement/SKILL.md)：独立的实现、review、commit 流程。

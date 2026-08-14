# Implement · 当前项目 UI 规范更新

## 执行清单

- [x] 1. 新建 `.trellis/spec/lingostack-app/frontend/ui-design.md`，按 `design.md` §3 写入当前
      UI 主契约；所有规则附源码路径、具体 class/token 或可观察结果。
- [x] 2. 在 UI 主契约中加入状态矩阵、Good/Base/Bad 场景、至少一组 Wrong vs Correct，以及
      UI 变更的验证断言。
- [x] 3. 更新 `components-and-styling.md`：链接主契约，保留工程实现规则，删除与新文档重复或
      冲突的表述，并补充组件复用边界。
- [x] 4. 更新 `testing-and-a11y.md`：校正 live region 现状，记录当前已覆盖区域、剩余缺口和
      新增异步区域的可执行语义契约。
- [x] 5. 更新 `index.md`：添加 UI 设计入口，改写设计资料加载方式，修正已过时的缺口摘要。
- [x] 6. 对照 `research/current-ui-evidence.md` 逐项核查，确认没有把旧原型能力写成当前能力。
- [x] 7. 检查文档引用、重复与冲突；确认没有修改 `src/`、Tailwind 配置或产品代码。

## 验证命令与验收点

```powershell
pnpm exec prettier --check ".trellis/spec/lingostack-app/frontend/ui-design.md" ".trellis/spec/lingostack-app/frontend/components-and-styling.md" ".trellis/spec/lingostack-app/frontend/testing-and-a11y.md" ".trellis/spec/lingostack-app/frontend/index.md" ".trellis/tasks/08-14-update-ui-spec/*.md" ".trellis/tasks/08-14-update-ui-spec/research/*.md"
git diff --check
rg -n '全站没有一处|固定 188px|底部状态栏|流式.*光标|嵌套卡片' .trellis/spec/lingostack-app/frontend
git diff --name-only
```

断言：

- 本任务目标文档的 Prettier 和 `git diff --check` 退出码为 0。
- 冲突搜索只允许出现在明确标注“旧规则/禁止项”的上下文中，不能作为当前要求。
- `git diff --name-only` 中本任务新增改动仅位于 `.trellis/spec/lingostack-app/frontend/` 与任务目录；
  会话开始前已有的 `.agents/`、`.codex/`、模板哈希变更不计入本任务。
- 逐个核对文档内组件名、token 和路径在仓库中存在。
- 本任务不运行也不宣称完成 UI 视觉回归；没有产品代码变化，因此 `pnpm test/build` 不是本任务
  验收依据。

## 执行结果

- 目标文档 Prettier：通过。
- `git diff --check`：通过。
- 文档链接及 29 个源码路径引用：通过。
- `pnpm lint`：通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm test`：通过，13 个测试文件、123 项测试。
- UI 视觉回归：未运行，未声明通过。
- 全前端规范目录的 Prettier：未通过；唯一失败文件是本任务未修改的既有
  `state-management.md`，本任务未越界格式化。

## 风险文件与回滚点

| 文件                        | 风险                     | 回滚点                     |
| --------------------------- | ------------------------ | -------------------------- |
| `ui-design.md`              | 把旧原型误写成现状       | 删除新文件并恢复索引       |
| `components-and-styling.md` | 与新主契约重复或矛盾     | 恢复原段落后缩小改动       |
| `testing-and-a11y.md`       | 把局部覆盖夸大为全站覆盖 | 依据三处源码重新列覆盖矩阵 |
| `index.md`                  | 入口与正文不一致         | 恢复旧索引并重新核对链接   |

## 开始前确认

- 用户已确认规范覆盖视觉、布局组件、交互状态、可访问性和桌面窗口适配。
- 最终规划摘要仍需用户再次明确批准，之后才能运行 `task.py start` 并修改正式规范。

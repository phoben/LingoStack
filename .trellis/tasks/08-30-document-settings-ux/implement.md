# 文档操作与设置界面优化实施计划

## Execution contract

- 当前只完成规划；必须在用户批准本规划后才能运行 `task.py start` 并修改产品代码。
- 基于工作区已有未提交改动做最小增量，不回退文档翻译任务的现有实现。
- 不提交、不推送、不部署、不归档，除非用户另行明确授权。

## Phase 1 — Regression tests first

- [x] 扩展 `docs-view.test.tsx`：翻译中只显示取消、取消走现有 IPC、兼容 paused/pausing 状态显示“已取消/重试”且无暂停/继续。
- [x] 扩展 `settings-view.test.tsx`：翻译、命名、文档三个功能 selector 都显示全局默认回退，global_default 仍显示未指定，并验证现有保存/清理行为。
- [x] 为 Prompt 标题行和主题间距补最小结构回归，同时保留 Label/radio/恢复行为断言。

## Phase 2 — Document action semantics

- [x] 从 `DocsView` 移除 Pause 图标、暂停按钮和 `pause` action 分支；翻译中只保留取消。
- [x] 将 paused/pausing 的用户文案改为取消状态，失败/取消后的动作统一为“重试”。
- [x] 从 `useDocumentStore` 移除不再被 UI 消费的 pause action；保留底层 IPC/Rust 兼容接口和迟到结果守卫。
- [x] 同步中英文 i18n，确保界面不再宣称支持“继续”。

## Phase 3 — Settings model and appearance layout

- [x] 调整 `SettingsAi` 空 option：translate/naming/doc_translate 使用全局默认文案，global_default 使用未指定。
- [x] 将每个 Prompt 的 Label 与“恢复内置”按钮组合到同一标题行，Textarea 位于其下且关联不变。
- [x] 为主题 radio 组增加局部上间距，不改变通用 `SetSection` 或其他设置区块密度。

## Phase 4 — Planning/spec consistency

- [x] 最小化更新 `.trellis/tasks/08-30-document-translation/` 中与暂停/继续冲突的需求、设计和验收文字，记录本任务的新产品决定。
- [x] 核对前端 UI 规范是否需要补充“取消/重试”与模型空值文案；只更新受影响契约，不扩写一次性实现细节。

## Phase 5 — Verification

- [x] 运行目标 RTL：`pnpm vitest run src/components/views/docs-view.test.tsx src/components/views/settings-view.test.tsx src/stores/document-store.test.ts`。
- [x] 运行 `pnpm lint`、`pnpm test`、`pnpm build` 和 `git diff --check`。
- [x] 使用 Trellis check 复核需求/规范、类型、测试与工作区边界。
- [x] 在可用本地 Tauri 运行时按 1080×720 和 864×576 检查设置 → AI、设置 → 外观及文档工具栏；若无法执行，明确标记视觉验收未运行。

## Phase 6 — Source-first document reader

- [x] 将 segmented radio 与文件菜单顺序改为原文→译文，初始 `DocumentView` 改为 source。
- [x] 同步 Home/ArrowLeft 与 End/ArrowRight 的焦点/选中顺序，保持 roving tabindex。
- [x] 默认读取并显示 source；translation 仅在 `complete=true` 时渲染，未完成片段继续隐藏。
- [x] 扩展 DocsView RTL，覆盖默认请求、视觉/DOM 顺序、键盘映射、菜单顺序及未完成译文保护。
- [x] 在真实 Tauri 空文档页确认原文位于译文之前、默认原文（复制动作显示“复制当前原文”），并验证可切到译文后再切回原文。
- [ ] 当前本地数据库无文档记录，未用真实文件验证 reader 首屏原文正文；该内容链路已由 DocsView RTL 的 `documentContent(id, "source")` 与可见原文断言覆盖。

## Risk and rollback points

- `docs-view.tsx`、`settings-ai.tsx`、`settings-view.tsx` 当前已有未提交改动：每次 patch 前核对当前 diff，禁止按旧版本整文件覆盖。
- 多个 selector 包含相同“使用全局默认模型”option，测试必须先按各自可访问 Label 定位 selector，再检查其 option，避免模糊全局查询。
- 纯布局回归不能只靠 RTL 宣称视觉通过；桌面窗口检查是独立证据。
- 回滚只涉及本任务新增的前端呈现、store action、i18n、测试及相关任务文档同步，不涉及 Rust/SQLite/config migration。

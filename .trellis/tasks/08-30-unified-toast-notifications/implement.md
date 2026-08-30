# 统一消息提醒实施计划

## Execution contract

- 当前仅完成规划；用户批准本规划后才能运行 `task.py start` 并修改产品代码。
- 实施前重新读取工作区 diff；所有重叠文件只做小块增量修改，不回退文档翻译与设置任务现有成果。
- 不提交、不推送、不部署、不归档，除非用户另行明确授权。

## Phase 1 — Dependency and shared primitive

- [x] 记录 `package.json` / `pnpm-lock.yaml` / `THIRD_PARTY_NOTICES` 当前 diff，使用 pnpm 增加 `sonner@^2.0.8`，保留既有依赖修改。
- [x] 新增 `src/components/ui/toaster.tsx`：单一 root Toaster、top-center + 16px 顶部偏移、主题、队列、时长、本地化可访问名称、现有 token classNames、禁用默认 hotkey。
- [x] 在 `App.tsx` 根部只挂载一次 Toaster；为 reduced-motion 补最小项目样式覆盖。
- [x] 先补 Toaster 组件/根装配测试，锁定单实例、可访问名称及关键配置，不断言库内部实现细节。

## Phase 2 — Translation, naming, selection and TTS

- [x] 将翻译原文/译文复制改为等待 Clipboard Promise 后通知成功/失败；删除 `copied` timer 状态。
- [x] 将翻译收藏改为完成后通知成功/失败；删除 `saved` timer 状态并保留 favorites 回滚事实。
- [x] 将命名候选复制改为统一 Toast，补成功/拒绝路径测试并删除 `copied` timer 状态。
- [x] 在 `App` 的划词事件边界发送剪贴板降级/最终失败提醒，移除 `selectionFeedback` store/UI 链路并更新现有桌面事件测试。
- [x] 将 TTS 失败统一桥接到根部一次性 Toast，移除翻译/收藏页重复 alert，确保视图切换不重复提示。

## Phase 3 — Favorites and documents

- [x] 收藏 JSON 导入、导出、删除接入统一成功/失败 Toast，删除局部 `notice` 条；加载/回滚错误保留并避免重复播报。
- [x] 文档读取、导入、复制、导出、删除及开始/取消动作的 `notice` 写入点迁移为 Toast；文件选择取消保持静默。
- [x] 文档 store error、unsupported、任务进度和 retry 状态继续在页面呈现；调整底部 alert 条件，不把持续状态移除。
- [x] 扩展 favorites/docs RTL，覆盖成功、Promise 拒绝、取消不提示、持续错误不被 Toast 重复替换。

## Phase 4 — Explicit settings actions

- [x] Provider 新增/编辑/删除在真实 config-store 保存完成后提示结果；Provider 必填校验保持表单内联。
- [x] 语言映射添加与热键保存/重新注册补显式完成反馈；映射/快捷键校验和逐行注册状态保持原位。
- [x] 核对主题、模型选择、Prompt 输入/恢复等自动保存路径，确保不会因连续变更刷成功 Toast；失败仍可见且不泄漏密钥。
- [x] 扩展 settings RTL，分别覆盖显式保存成功/失败与自动保存无成功 Toast。

## Phase 5 — Localization, spec and dependency notice

- [x] 更新 `src/lib/i18n.ts` 中英文消息键、通知区域名和关闭按钮名；保持键集合一致。
- [x] 更新 UI 主契约与测试/可访问性规范：固化 Toast 适用边界、单实例、polite vs alert、时长/位置和 reduced-motion。
- [x] 运行 `pnpm notices:generate`；检查 `THIRD_PARTY_NOTICES` 为确定性生成结果且保留当前依赖图已有变化。
- [x] 检查 `CLAUDE.md` 仓库布局：`ui/` 目录已存在，未做与本任务无关的结构改写。

## Phase 6 — Verification

- [x] 运行受影响 RTL（Toaster、App、translate、naming、favorites、docs、settings）。
- [x] 运行 `pnpm lint`、`pnpm test`、`pnpm build`、`git diff --check`。
- [x] 复查 `pnpm-lock.yaml`、`package.json`、`THIRD_PARTY_NOTICES` 与所有重叠源码 diff，确认未回退其他活动任务改动。
- [x] 使用 Trellis check 复核 PRD/spec、数据流、a11y、测试和工作区边界。
- [x] 原始实现曾在本地 Tauri 主窗口按 1080×720 / 864×576 验收 bottom-center、明暗主题、长文案、三条连续提醒和焦点保持；`prefers-reduced-motion` 仅完成 CSS 静态核验，未改动系统级动画设置做运行时切换。

## Phase 7 — Top placement refinement

- [x] 按用户最新要求将全局 `position` 调整为 `top-center`，顶部间距最终确认为 16px；业务调用方、时长、主题和队列行为不变。
- [x] 更新 Toaster 组件测试，锁定 `position="top-center"` 与 `offset={16}`。
- [x] 在真实 Tauri 窗口触发“已复制” Toast，确认位于顶部居中且未遮挡最小化、最大化、关闭等标题栏关键操作。

## Risk and rollback points

- `App.tsx`、docs/settings/i18n、package/lockfile/spec/notices 均已被其他活动任务修改；禁止整文件替换或依据 HEAD 重建。
- Clipboard API 必须 `await` 后再报成功；先弹成功再忽略 rejection 属于验收失败。
- Store 业务错误与 Toast 不得双重播报；若某 action 无可靠完成结果，优先增加最小显式结果，不创建新通知 store。
- 批量文档操作限制同时可见 Toast 数量；不要为每个成功片段或流式 chunk 发消息。
- 回滚只撤销本任务的 Sonner 适配、调用、测试、依赖和规范增量，不触碰其他任务当前修改。

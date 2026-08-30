# 统一轻量消息提醒

## Goal

为用户主动操作提供统一、美观且轻量的短时消息提醒，让复制、收藏、导入、导出、删除和显式保存等动作都能立即得到一致反馈，同时保留需要持续查看、重试或就地修正的业务状态。

## Background

- 当前项目没有 Toast 依赖；`package.json:24-35` 的 UI 相关依赖只有 React、Lucide、Tailwind 辅助库和 Zustand。
- 当前短时反馈分散在局部状态中：翻译页复制/收藏使用 1.5 秒图标状态（`src/components/views/translate-view.tsx:149-155,244-285`），命名页复制使用 1.5 秒图标状态（`src/components/views/naming-view.tsx:45-50`），收藏页导入使用顶部通知条（`src/components/views/favorites-view.tsx:47-77,143-151`），文档页把复制、导出、删除和动作失败统一放进底部 alert（`src/components/views/docs-view.tsx:96,201-262,320-325,568-576`）。
- 划词降级/失败经 app store 传到翻译页的可关闭提示条（`src/App.tsx:63-84`、`src/components/views/translate-view.tsx:334-362`）；它属于一次热键操作的反馈。
- 流式翻译/命名错误带有局部结果和重试入口，文档任务有持续进度，Provider 表单校验需要就地修正；这些不是短时 Toast 的替代对象（`translate-view.tsx:415-435`、`naming-view.tsx:77-158`、`docs-view.tsx:473-576`、`provider-form.tsx:43-62,120`）。
- 现有 UI 契约要求使用语义 token、顶部居中胶囊式 Toast、约 1.5–1.6 秒成功反馈、`aria-live` / `role="alert"` 语义以及 `prefers-reduced-motion` 降级。
- 当前工作区已有文档翻译与设置页的大量未提交改动；本任务必须在当前源码上做增量修改，不得恢复旧版本或覆盖其他活动任务成果。

## Requirements

### R1. 采用单一轻量提醒组件库

- 引入 `sonner`，使用当前已核验的 React 18 兼容版本，并更新 pnpm lockfile。
- 全应用只挂载一个 Toaster；业务页面只能调用统一通知入口，不得各自创建 Toaster 或重复配置视觉样式。
- 组件库不得引入遥测、网络服务或新的运行时依赖链；许可证必须进入现有第三方通知生成流程。

### R2. 提醒视觉与桌面窗口一致

- Toast 固定在主窗口顶部居中并保留 16px 顶部间距，使用现有 `background` / `surface` / `border` / `foreground` / `success` / `info` / `warning` / `destructive` 语义 token，不硬编码第二套主题色。
- 默认呈现紧凑胶囊形态，不新增页面卡片；成功、信息、警告、失败不能只靠颜色区分，必须同时有图标或文案语义。
- 成功提示默认约 1.6 秒；需要阅读的警告/失败可适当延长。限制同时可见数量，避免批量操作产生遮挡。
- 跟随 light / dark / system 主题，不抢夺当前焦点；关闭标签和通知区域名称支持中英文。
- 尊重 `prefers-reduced-motion`；最小窗口 `864×576` 下不得遮挡主要操作或溢出窗口。

### R3. 将短时操作反馈统一迁移为 Toast

- 翻译：原文/译文复制成功或失败、收藏成功或失败；移除仅为 1.5 秒反馈存在的 `copied` / `saved` 局部状态。
- 命名：候选名复制成功或失败；移除仅为 1.5 秒反馈存在的 `copied` 局部状态。
- 收藏：JSON 导入、导出、删除的成功或失败；移除局部 `notice` 通知条。列表加载失败或数据回滚错误仍须保持可观察。
- 文档：读取、导入、复制、导出、删除及开始/取消动作产生的短时结果；移除局部 `notice` 及其通用底部提示。文档 store 错误、unsupported 状态、翻译进度和可重试状态仍保留在阅读器/列表中。
- 设置：Provider 新增/编辑/删除、语言映射添加和热键保存/重新注册等显式提交动作给出完成反馈；字段校验、热键冲突和逐行注册结果继续就地显示。主题、模型下拉、Prompt 输入等即时自动保存控件不得每次变化都弹成功 Toast。
- 划词与朗读：剪贴板降级、最终取词失败和 TTS 操作失败改为全局提醒；取词失败文案仍必须包含“手动粘贴”恢复建议。
- 所有新增或调整的可见文案同时提供中文和英文，不向消息中写入 API Key 等敏感配置值。

### R4. 保留持续状态与恢复入口

- 流式任务状态、部分结果、诊断、错误和重试按钮保持在翻译/命名结果区，不用 Toast 取代。
- 文档进度、unsupported/failed 状态、数据加载错误和确认删除流程保持原有业务位置与原生确认框。
- Provider 必填校验、映射冲突、快捷键格式/注册冲突继续就地呈现并关联到用户正在编辑的内容。
- 同一消息不得同时通过 Toast 和页面 live region 重复播报；仅短时、非阻塞结果进入 Sonner 的 polite live region，必须立即处理或需要持续恢复的信息继续使用页面 `role="alert"`。

### R5. 兼容当前状态与工程边界

- 不改变 Rust command、IPC 数据形状、配置 schema、IndexedDB schema、文档数据库或 Tauri capability。
- 不引入新的 Zustand 通知 store；Sonner 自身负责瞬时队列，现有业务 store 继续维护业务事实与回滚策略。
- 对当前已修改的 `App.tsx`、文档/设置视图、i18n、package/lockfile 和 UI spec 只做最小增量，并在实施前后检查差异，保留其他任务的修改。

## Acceptance Criteria

- [ ] AC1：应用根部只有一个 LingoStack 风格 Toaster；在 light、dark、system 三种模式下均使用现有语义 token，位置为顶部居中且顶部偏移 16px。
- [ ] AC2：翻译、命名、文档中的复制操作均在成功时显示统一成功 Toast，在 Clipboard Promise 拒绝时显示失败 Toast；不再依赖局部 1.5 秒 copied 状态或页面 notice。
- [ ] AC3：翻译收藏、收藏 JSON 导入/导出/删除及文档导入/导出/删除在完成或失败后给出可观察的统一反馈；失败时既不伪报成功，也不破坏现有回滚/数据状态。
- [ ] AC4：Provider 新增/编辑/删除、映射添加、热键保存/重新注册等显式提交有反馈；主题、模型选择和 Prompt 输入不会因自动保存连续弹出成功 Toast。
- [ ] AC5：剪贴板取词降级、取词最终失败及 TTS 失败通过全局提醒呈现；最终取词失败仍明确指导用户手动粘贴。
- [ ] AC6：流式结果/错误/重试、文档持续状态、store 加载错误、表单校验和热键冲突仍在原业务位置，且同一消息不被 Toast 与 live region 重复播报。
- [ ] AC7：Toast 区域有本地化可访问名称，普通提醒通过 polite live region 播报；所有交互保持键盘可达、焦点不被 Toast 主动抢走，减少动画偏好生效。
- [ ] AC8：新增/更新 RTL 覆盖根部单实例、主题/位置/时长配置及各目标功能的成功与失败消息；`pnpm lint`、`pnpm test`、`pnpm build`、`git diff --check` 通过。
- [ ] AC9：依赖变更经 `pnpm notices:generate` 生成第三方通知；检查 `THIRD_PARTY_NOTICES` 只包含当前依赖图应有的确定性变化，不手工编辑生成物。
- [ ] AC10：在可用的本地 Tauri 窗口按 `1080×720` 与 `864×576` 验证顶部居中及 16px 间距、长文案换行、连续 Toast 堆叠、明暗主题和无主要控件遮挡；未执行时必须明确标记，不以 RTL 代替视觉证据。

## Out of Scope

- 用 Toast 取代流式输出、文档进度、可重试错误、表单校验、热键冲突或原生删除确认。
- 新增系统级 Windows 通知、托盘气泡、声音/振动、通知中心持久化或跨窗口同步。
- 重构全部业务 store、引入新的全局通知 Zustand store，或迁移现有手写 UI 原语到 shadcn/Radix。
- 修改 Rust、IPC、数据库、配置结构、CI workflow，或处理其他活动任务的归档/提交。

## Technical Notes

- 组件选型与迁移盘点见 `research.md`，实现边界见 `design.md`，执行和验证顺序见 `implement.md`。
- 阻塞问题：无。最终规划仍需用户批准后才能进入实施。

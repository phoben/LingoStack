# 统一消息提醒技术设计

## 1. Design outcome

用户完成一次离散操作后，在当前窗口顶部中央、距顶边 16px 处看到统一、短时、可访问的消息；需要持续观察、就地修正或重试的信息仍留在业务区域。实现增加一个 Sonner 适配层，不增加通知业务 store，也不改变 Rust/IPC/数据库契约。

## 2. Component boundary

新增 `src/components/ui/toaster.tsx` 作为唯一视觉适配层：

```text
App
├─ existing title/sidebar/view tree
└─ LingoStackToaster (mounted once)
      └─ Sonner Toaster (top-center, 16px offset, themed, bounded queue)

view/action handler
└─ toast.success / toast.error / toast.info
      └─ existing i18n message
```

`LingoStackToaster` 负责位置、主题、默认时长、最大可见数量、偏移、通知区域名称、关闭按钮名称和 classNames。业务页面只选择语义类型并传本地化文案，不得覆盖颜色、圆角和位置。Sonner 的瞬时队列已覆盖本需求，不再创建 Zustand notification store。

## 3. Visual contract

- `position="top-center"`、`offset={16}`，距窗口顶边保留四格 4px 间距；限制宽度并允许长错误换行。
- 表面使用 `surface` / `background`，文字使用 `foreground`，边框使用 `border`，阴影使用 `shadow-ring`；成功/info/warning/error 分别复用现有语义色。
- 成功和普通信息采用紧凑胶囊；失败文案可换行但保持同一组件语言，不引入嵌套卡片。
- 默认成功反馈 1600ms；普通信息约 2500ms；需要阅读的错误约 4000ms。最多同时显示 3 条，批量操作不无限堆叠。
- 主题取现有 theme store 的 `light | dark | system`，不读取新的 storage key。
- 默认 Sonner hotkey 关闭，避免引入未在 LingoStack 快捷键配置中声明的操作。
- 项目 CSS 对 `prefers-reduced-motion: reduce` 明确关闭 Toast 位移/过渡动画；功能与自动消失仍保持。

## 4. Feedback classification

| 类型             | 呈现                 | 例子                                          |
| ---------------- | -------------------- | --------------------------------------------- |
| 短时成功/信息    | Sonner polite Toast  | 已复制、已收藏、已导入、已导出、剪贴板降级    |
| 短时非阻塞失败   | Sonner error Toast   | Clipboard 拒绝、导出写文件失败、显式保存失败  |
| 持续任务事实     | 原业务区域           | streaming、文档翻译百分比、unsupported/failed |
| 需就地修正       | 字段附近 alert/text  | Provider 必填、语言映射冲突、快捷键格式冲突   |
| 带恢复动作的错误 | 结果区 alert + retry | 翻译/命名流中断、保留部分输出后重试           |
| 破坏性确认       | 原生 confirm         | 永久删除文档                                  |

同一结果只走一个通道。页面已保留 alert 的持续错误不再同步弹 Toast；迁移到 Toast 的 `notice`/临时 copied 状态从 DOM 删除。

## 5. Data flow and action handling

### Copy/favorite/import/export/delete

调用方必须等待 Promise 后再显示结果；当前未等待 Clipboard 的翻译/命名复制改为 `async` + `try/catch`，避免先报成功后 Promise 拒绝。

Favorites store 保持既有乐观更新与失败回滚。视图在 `await add/remove/importAll` 后读取该动作完成后的 store error，成功才通知；不改变 store 的数据一致性策略。若实施中发现并发动作会使该读取不可靠，再将对应 action 最小调整为显式结果返回值，并同步其测试，不引入全局通知状态。

文档 store 的业务状态仍由 store/SQLite 维护；`DocsView` 只把现有 `notice` 写入点映射到 Toast，`error` 与 `unsupported` 的持续呈现不变。文件选择器取消不显示成功或失败。

### Selection and TTS

`App` 已接收 `translate-selection`，可在成功降级或最终失败时直接触发全局 Toast；随后移除仅为提示条服务的 `selectionFeedback` app-store 字段和翻译页 UI。失败消息继续包含手动粘贴建议。

TTS error 由应用根部统一观察并在显示一次后清理，避免翻译页和收藏页重复实现。同一次错误不得因视图切换再次弹出。

### Settings

只有 Provider CRUD、映射添加、热键保存/重新注册等有明确“提交完成”边界的 handler 使用 Toast。自动保存型 radio/select/textarea 保持安静；保存失败继续由 config store 记录，显式 handler 在完成后读取结果并决定成功或失败提醒。字段校验和逐行热键注册状态保留在原位置。

## 6. Localization and security

Toast 文案通过现有 `useT()` 字典生成，中英文键保持一致。消息只包含动作对象的安全显示名与 `stringifyError` 后的业务错误；Provider 提醒不得插入 API Key，底层错误也不得序列化完整配置对象。

## 7. Accessibility

- Sonner 根区域使用本地化通知名称并保持 `aria-live="polite"`；普通操作反馈不抢焦点。
- 必须立即处理或需要持续恢复的信息继续由页面 `role="alert"` 提供，不嵌入 polite Toast，避免重复播报。
- 成功/失败同时有图标和文案，不只靠颜色；关闭按钮有本地化名称。
- 组件测试从用户可观察文本和 live region 查询，不依赖 Sonner 内部 DOM 层级或 Tailwind class；视觉 token 与 reduced-motion 另做静态/运行时核验。

## 8. Compatibility and dependencies

- 新增 npm production dependency 与 lockfile；React 18 peer 已满足。
- 不改 Tauri capability、IPC、Rust workspace、IndexedDB/SQLite schema或配置文件结构。
- `THIRD_PARTY_NOTICES` 必须由现有生成器重新生成，不手工拼接 Sonner 条目。
- 当前重叠文件全部基于工作区版本做 hunk 级增量 patch；每轮开始前重新读取差异，保留文档/设置任务成果。

## 9. Verification and rollback

- RTL：Toaster 单实例/主题/配置；复制失败；收藏/文档动作成功失败；设置显式提交；划词与 TTS 全局反馈；持续 alert 不重复。
- 静态与单元门禁：`pnpm lint`、`pnpm test`、`pnpm build`、`git diff --check`。
- 依赖门禁：`pnpm notices:generate` 后核对生成物与 lockfile。
- 桌面视觉：1080×720 与 864×576，明暗主题、短/长消息、连续三条、减少动画。
- 回滚时移除 Sonner wrapper/调用和依赖，恢复被迁移的局部提示状态；不涉及数据、Rust 或 migration 回滚。

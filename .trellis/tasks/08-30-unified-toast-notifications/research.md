# 轻量消息提醒调研

## 1. 当前反馈盘点

| 区域                       | 当前做法                                           | 规划处理                                   |
| -------------------------- | -------------------------------------------------- | ------------------------------------------ |
| 翻译复制/收藏              | 组件局部 `copied` / `saved` + 1.5 秒 timer         | Toast 成功/失败，删除临时状态              |
| 命名复制                   | 组件局部 `copied` + 1.5 秒 timer                   | Toast 成功/失败，删除临时状态              |
| 收藏导入                   | 顶部 `aria-live` notice                            | Toast；数据/store 错误按边界保留           |
| 收藏导出/删除              | 无成功提示，失败走 store error                     | 补统一成功/失败 Toast                      |
| 文档读/导入/复制/导出/删除 | 单个 `notice` 与底部 `role="alert"` 混合成功和失败 | 短时结果迁 Toast；持续 store/status 留页面 |
| 设置显式提交               | 保存大多由 store 自动完成，成功反馈不统一          | 仅显式提交 Toast；即时自动保存不刷屏       |
| 划词降级/失败              | app store -> 翻译页提示条                          | 根部触发 info/error Toast，保留恢复文案    |
| TTS 失败                   | 翻译/收藏页重复 alert                              | 统一为一次全局错误提醒                     |
| 流式任务/文档进度/表单校验 | 稳定业务区域 + retry/field context                 | 保留，不迁移                               |

## 2. 候选对比

| 方案                       | 当前核验                                                                                                                      | 适配结论                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `sonner`                   | 2.0.8、MIT、React 18/19 peer、零运行时依赖；单 Toaster + 全局函数 API；支持 bottom-center、主题、类型、时长、数量、classNames | 推荐。最符合“轻量、美观、少依赖”，可由一个项目 wrapper 绑定现有 token                        |
| `react-hot-toast`          | 2.6.0、MIT；官方标注小于 5KB且可访问；运行时依赖 `goober` 与 `csstype`                                                        | 能完成需求，但会额外引入 CSS-in-JS 运行时与依赖，不如 Sonner 贴合当前 Tailwind/手写原语体系  |
| 自研 Toast store/component | 无外部依赖                                                                                                                    | 需要自行实现队列、计时暂停、堆叠、可访问性和动画，偏离用户明确要求的 UI 组件库，也增加维护面 |

## 3. 选择结论

采用 `sonner@^2.0.8`，并在 `src/components/ui/` 增加单一项目 wrapper：

- 根部只挂载一次；业务调用不接触位置、颜色、时长等视觉参数。
- 最初建议 bottom-center；用户在 2026-08-30 明确改为全局默认 top-center，随后根据实机观感把顶部偏移从 8px 调整为 16px。成功约 1600ms、最多 3 条；错误/警告按项目入口延长。
- 用现有语义 token 覆盖视觉，不启用独立 rich-color 调色板。
- 禁用默认通知快捷键，避免与桌面全局快捷键形成第二套未声明操作。
- Toast 只承载短时非阻塞结果；紧急或需持续恢复的错误继续由页面 alert 承载，避免 Sonner polite region 与页面重复播报。
- 为减少动画偏好增加明确的项目级覆盖，并在真实 Tauri 窗口验证。

## 4. 一手来源

- Sonner 官方 README：<https://github.com/emilkowalski/sonner>
- Sonner 官方 Toast API：<https://github.com/emilkowalski/sonner/blob/main/website/src/pages/toast.mdx>
- Sonner 官方类型与定制入口：<https://github.com/emilkowalski/sonner/blob/main/src/types.ts>
- Sonner 官方可访问区域实现：<https://github.com/emilkowalski/sonner/blob/main/src/index.tsx>
- react-hot-toast 官方仓库与体积说明：<https://github.com/timolins/react-hot-toast>
- react-hot-toast 官方包清单：<https://github.com/timolins/react-hot-toast/blob/main/package.json>

## 5. 当前工作区风险

`package.json`、`pnpm-lock.yaml`、`App.tsx`、`App.test.tsx`、`settings-ai.tsx`、`docs-view.tsx`、`settings-view.tsx`、`i18n.ts` 和 UI spec 已有其他活动任务的未提交修改。实施必须逐文件做增量 patch；生成 lockfile/许可证后检查目标 diff，不得把现有依赖或文档改动当作本任务产物回退。

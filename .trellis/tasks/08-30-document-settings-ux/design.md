# 文档操作与设置界面一致性设计

## 1. Design outcome

本任务只修正用户可见的交互语义和布局，不改变整篇文档翻译、配置持久化或数据库协议。用户看到的是“取消一次在途请求，之后可整篇重试”，设置页则用同一套文案解释功能模型如何继承全局默认值。

## 2. Document control boundary

`DocsView` 不再导入或渲染暂停图标，也不再向页面动作分发器暴露 `pause`。翻译中只保留 `cancel`；失败或内部 `paused` / `pausing` 记录只显示“重试”。

`useDocumentStore` 删除只为 UI 服务的 `pause` action 与 `pauseDocument` import，保持 `start`、`cancel`、`remove` 等现有接口。底层 `src/lib/ipc.ts` 的 `pauseDocument` wrapper 和 Rust `pause_document` 命令暂不删除，以保留兼容边界并避免把本次 UI 优化扩大为跨 IPC 清理。

内部状态不迁移：

```text
translating -> 用户点击取消 -> backend paused compatibility state
                                  -> UI 显示“已取消” + “重试”
                                  -> 重试调用 translate_document，重新提交整篇 Markdown
```

`pausing` 同样按取消中的兼容状态处理，不再使用“暂停”文案。失败态和已取消态复用现有 `retry` 文案；完成态继续使用“重新翻译”。

阅读模式采用原文优先：`useState<DocumentView>("source")`，segmented radio 与文件菜单均按 source→translation 排列；Home/ArrowLeft 选择 source，End/ArrowRight 选择 translation。translation 只有在 `DocumentContent.complete` 时进入 reader，避免翻译中或部分失败的内部片段泄露。

## 3. Model inheritance presentation

`ModelAssignment` 和 `setFeatureModel` 已经用 `null` 表达功能级回退，不新增配置字段。`SettingsAi` 只调整空 option 的呈现规则：

| 行       | 空值文案         | 保存值                         |
| -------- | ---------------- | ------------------------------ |
| 翻译     | 使用全局默认模型 | `models.translate = null`      |
| 命名     | 使用全局默认模型 | `models.naming = null`         |
| 文档     | 使用全局默认模型 | `models.doc_translate = null`  |
| 全局默认 | 未指定           | `models.global_default = null` |

具体模型 option、提供商删除时的统一引用清理和 config-store 自动保存保持不变。

## 4. Appearance composition

Prompt 区域保持现有纵向列表，每项改为：

```text
[业务 Label]                         [恢复内置]
[Textarea....................................]
```

标题行使用 `flex items-center justify-between gap-3`；输入框与标题行使用现有 4px 网格间距。`label htmlFor` 与 `Textarea id` 保持关联，按钮仍为次级/ghost 动作，不新增卡片或颜色。

主题区只在单选组上增加与标题分离的上间距，避免修改通用 `SetSection` 后影响其他设置区块。主题 radio、Label、主题 store 和 `lingostack.theme` storage key 均不变。

## 5. Localization and accessibility

- 中文/英文新增“已取消”或等价状态文案；“重试”复用现有 `retry`。
- 文档动作继续使用原生 button；模型选择继续使用原生 select；主题继续使用 radio + label。
- 测试通过 role 和 accessible name 验证行为；布局关系通过同一标题行 DOM 结构和必要的 class 断言补充，视觉结果由本地桌面验收单独证明。

## 6. Compatibility and task alignment

- 不改 Rust serde、TypeScript IPC 类型、Tauri handler、SQLite schema 或配置文件结构。
- `.trellis/tasks/08-30-document-translation/` 中“暂停/继续保持有效”的旧文字已被本次产品决定取代；实施时只改冲突句和对应验收项，不重写该任务其他历史内容。
- `.trellis/spec/lingostack-document/backend/index.md` 的“暂停/取消不得提交迟到结果”仍是有效内部安全契约，不删除。

## 7. Verification strategy

- DocsView RTL：翻译中有取消无暂停；取消调用正确边界；paused/pausing 呈现取消状态与重试而非继续。
- DocsView RTL：默认请求/显示 source，radio 与菜单按 source→translation 排列；键盘映射一致，切到未完成 translation 时 reader 不显示片段。
- Settings RTL：翻译、命名、文档 selector 的空 option 均为全局回退；全局默认为空时仍未指定；写入与清理不回退。
- Appearance RTL：Prompt Label 与恢复按钮共享标题行，恢复行为保持；主题标题与 radio 组存在约定间距且 radio 可访问名称保持。
- 静态门禁：目标测试、`pnpm lint`、`pnpm test`、`pnpm build`、`git diff --check`。
- 视觉门禁：本地 Tauri 主窗口 1080×720 与 864×576；记录为 manual/local-runtime 证据，不与 RTL 混淆。

## 8. Rollback

所有产品代码改动均为前端呈现和前端 action surface 的可逆调整。若回滚，只需恢复组件、store action、i18n 和测试；无需回滚数据库、配置文件或 Rust migration。

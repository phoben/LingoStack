# 连续 Markdown 文档翻译设计

## 1. Design outcome

文档功能从“结构块对照器”改为“连续 Markdown 阅读器”。外部 seam 只暴露文档列表、任务动作和按 `source | translation` 读取整篇 Markdown；解析结构只负责源 Markdown 规范化，generation 负责整篇结果的原子替换。

删除该 module 后，解析、Markdown 重建、整篇请求持久化、暂停/重试和原子重译规则会重新散落到 Tauri/React，因此该 interface 具有足够 depth。

## 2. User flow

1. 用户在顶部原文/译文切换右侧点击“导入文档”或把文件拖入阅读区。
2. 后端解析并持久化规范化 Markdown 执行片段；新文档立即开始翻译，重复内容打开已有记录。
3. 点击已完成记录时进入译文，点击其他状态记录时进入原文；新导入记录启动翻译后自动进入译文，并以覆盖式加载层等待完整结果，不显示任何源片段、局部结果或占位标记。
4. 用户可切换原文/译文，复制当前 Markdown，或把当前 Markdown 另存为 `.md`。
5. 用户可取消在途翻译，随后整篇重试或重新翻译并删除；内部暂停兼容状态按已取消呈现，不承诺断点继续。

## 3. Deep module interface

`lingostack-document` external interface：

```rust
enum DocumentView { Source, Translation }

struct DocumentContent {
    markdown: String,
    complete: bool,
    missing_parts: u32,
}

fn document_content(&self, document_id: &str, view: DocumentView)
    -> Result<DocumentContent, DocumentError>;
```

Tauri 提供一个镜像命令，React 只依赖该结果。`blocks_for_document`、`generation_terms_for_document` 不是 reader interface，应从 Tauri/TS 移除；新翻译链路不存在逐块 scheduler。

`DocumentSnapshot` 暂时保留 `block_count` / `translated_count` 供后台兼容与状态计算，但列表 UI 不展示百分比或块计数；这两个字段不能重新成为 reader presentation contract。

## 4. Canonical Markdown representation

`lingostack-docparse` 继续产生带 `BlockKind` 和 `Segment` 的语义块。写入 SQLite 时为每块保存稳定 `markdown_kind`：heading level、paragraph、list item、quote、code、table row/cell。

源 Markdown 规范化规则：

- heading -> `#..###### text`
- paragraph -> `text`
- list item -> `- text`
- quote -> `> text`
- code -> fenced code block，正文全部受保护
- table row -> 将 tab 分隔单元转为 pipe row；缺少可靠表头时不伪造业务含义
- table cell -> 普通段落兜底

源文档由 fragment renderer 规范化后合成为一篇 Markdown。模型一次收到完整 Markdown 文档，返回一篇合法的目标语言 Markdown；解析块不再构成请求、响应或调度协议。

## 5. Persistence and migration

Schema v3 为 `blocks` 增加 `markdown_kind TEXT NOT NULL DEFAULT 'paragraph'`；v4 增加按 generation 保存的完整 `document_results`。旧 source/translation 不改写：只有已完成的 active legacy generation 可连续展示，未完成旧分块结果不进入阅读器。新导入记录保存精确 kind。

active/working generation、内容哈希判重保持不变。重译把一个完整结果写入 working generation，全部成功后原子提升；没有逐片段提交或面向用户的术语结果。

## 6. Translation continuity

首期把规范化后的整篇 Markdown 作为单次异步翻译请求。解析语义块只用于得到稳定的 Markdown 原文，不是调度或阅读模型；请求成功前不持久化或展示任何局部译文。连续性通过以下机制保证：

- 单一文档语言/目标语言/模型/Prompt 快照；
- Markdown heading/list/quote 等语法随整篇文档发送；
- 完整结果作为一个 generation 原子提升，阅读器只读取该完整 Markdown。

这是 local-substitutable module：SQLite 使用临时数据库，provider seam 使用 deterministic adapter；测试通过 document interface 断言最终 Markdown，而不是断言 React 中的块。

## 7. Frontend composition

`DocsView` 保持两栏整体骨架：

- 左栏：无标题容器的搜索/筛选工具区和可滚动记录列表，不再保留底部按钮容器。
- 右栏顶部：左置原文/译文 segmented toggle，紧邻导入按钮；当前文档动作靠右。列表项只显示图标和文件名，状态保留在可访问名称。
- 右栏正文：一个 `MarkdownDocument` renderer；列表点击按 completed→translation / other→source 决定视图，新导入翻译强制进入 translation。
- translation + translating 时 reader 内挂载覆盖式 loading status；父区 busy，完成时同一视图原位渲染完整 Markdown。
- 右栏底部：单一 alert/notice 区。

引入 `react-markdown` + `remark-gfm`。不启用 raw HTML；链接使用安全协议并在新窗口打开。用现有设计 token 为 heading、paragraph、list、blockquote、table、inline/fenced code 提供样式，不新增嵌套卡片。

阅读位置按 document + view 分别保留。翻译进度刷新内容时不强制滚回顶部。

## 8. Copy and export

- `copy`：复制当前 `DocumentContent.markdown`，不是渲染后的 DOM 文本。
- `export`：当前 source/translation 保存为 `.md`。
- translation 不完整时不提供伪造的部分 Markdown 导出；用户可导出完整原文，或等待/重试获得完整译文。

## 8.1 Document translation model setting

AI 设置中的“文档” / “Document”是 `models.doc_translate` 的唯一编辑入口。该 select 使用明确的本地化可访问名称；空值显示“使用全局默认模型”，由既有 `ModelAssignment::resolve(Feature::DocTranslate)` 处理 feature → global default 回退。提供商删除复用现有统一清理列表，避免留下失效模型引用。

删除双语和纯文本导出 interface，避免 UI 再次承载格式矩阵。

## 9. Error and accessibility

- import/reader/export/action 的离散错误使用全局 Toast；store 数据加载与 unsupported 等需持续观察的状态仍保留业务区错误边界。文档翻译失败原因来自持久快照，并按 `document_id + error_message` 去重 Toast，不在 reader 重复展示详情。
- 列表项不显示状态文字或百分比；按钮可访问名称组合文件名与本地化状态。译文加载层使用稳定 `role=status` / `aria-live=polite`，父 reader 区使用 `aria-busy`。
- source/translation 使用单一 `radiogroup` 与两个 `radio`，当前模式同时具备 `aria-checked` 和稳定高亮；导入按钮、复制、导出、删除都有可访问名称。
- UI 不再出现“结构块”“双栏”“单栏”“上下文术语”等用户文案。

## 9.1 Desktop context menus

应用根节点统一拦截 WebView 的原生 `contextmenu` 默认行为。需要右键交互的区域自行打开一个应用内、可键盘操作的浮层菜单；菜单使用现有设计 token，并在外部点击、Escape、窗口滚动或尺寸变化时关闭。

- 文件列表菜单先把右键目标设为当前文档，再按查看原文、查看译文、删除排列；删除调用与工具栏相同的两次确认函数。
- Markdown 阅读区打开菜单时保存当时的选中文字；支持复制所选、复制当前完整 Markdown、全选阅读区。它不引入 contenteditable，也不改变首期只读边界。
- 菜单项使用 `menu` / `menuitem` 语义和方向键焦点移动，不能靠浏览器原生菜单兜底。

## 9.2 Deletion failure boundary

Tauri production capability 必须显式允许 confirm dialog。确认调用、持久化删除和列表更新都位于同一个可观察错误边界中：任何 reject 都进入页面 alert；两次确认任一返回 false 时安全退出。删除成功后 store 从后端成功结果更新列表，并为被删的当前记录选择剩余第一项。

## 10. Verification

- docparse：各 BlockKind 到源 Markdown 语法的 fixture 断言。
- document module：v1/v2/v3→v4 迁移；source/translation 连续 Markdown；未完成结果不可见；重译原子性与完成后 100% 快照。
- app IPC：`DocumentView` / `DocumentContent` 精确 JSON shape；旧 reader commands 已移除。
- RTL：导入按钮紧邻 segmented toggle 且左栏没有底部操作容器、completed/other 列表点击分流、导入后自动译文、覆盖式 loading→完整译文、右键显式模式、Markdown semantic DOM、复制/导出、列表无状态/百分比/块 UI。
- RTL：补充两次确认删除、确认失败提示、全局默认菜单抑制、文件/阅读区内置菜单和 radio checked/highlight 语义。
- Windows Tauri E2E：真实导入→翻译→切换→删除，并断言无 `undefined.id`、radio 语义和内置右键菜单可观察。
- Settings RTL：进入 AI 子标签后，可按“文档” / “Document”定位唯一 selector；选择、清空和提供商删除分别验证 `models.doc_translate` 的保存、回退与清理。

## 11. Rollback

v3 只增加非空默认列，v4 只增加 `document_results` 表，旧应用可忽略新增表；迁移不删除源文件和现有完整译文。若 Markdown renderer 出现问题，可回退到显示 Markdown 源文本，但不可恢复逐块请求或逐块 UI。

## 12. UI polish and batch import

- 文档 toolbar 的第一个可聚焦控件是原文/译文 segmented radio；当前文档进度不在 toolbar 或列表项中显示，列表视觉只保留状态图标与文件名。
- 文件选择器开启 multiple，拖放遍历全部受支持文件；每个文件独立执行读取、导入和后台任务，单个失败进入页面 alert 且不阻塞其他文件。批量触发复用现有 document store/API，不增加批次持久化模型。
- translating/parsing 列表项使用语义色旋转图标，动效采用现有时长/easing，并用 `motion-reduce:animate-none` 降级；可访问名称继续携带状态。
- 设置页只改变 presentation：AI 文档行简写为“文档”，appearance 的主题和 Prompt 行使用 i18n 文案、明确 `<label>` 和一致 gap；配置 key 保持不变。
- 关于页直接使用无 toolbar 的 `ViewShell`，在内容区居中复用产品品牌标记；更新按钮首期为 disabled 占位，明确“即将支持”，不伪造网络更新能力。

## 13. Response-body transport failures

- `reqwest::Response::bytes_stream()` 的读取、解压或连接中断属于传输错误，三个 provider 在进入 SSE/JSON parser 前映射为 `LlmError::Network` / `Timeout`；真正的 UTF-8、SSE、JSON payload 错误仍为不可重试 `Stream`。
- 三个流式 provider 不设置覆盖整个响应体生命周期的总 deadline；共享客户端使用 60 秒逐次读取空闲超时（成功读取后重新计时）与 15 秒连接超时，避免持续输出的长文档在固定总时长后被误判为超时，同时仍能终止真正停滞的连接。
- 文档翻译与普通翻译共享“仅零输出、最多自动重试一次”的安全边界；收到任意增量后立即失败并保留原因，不自动重发整篇请求，避免重复内容与重复计费。
- 最终失败继续写入 `DocumentSnapshot.error_message`；当前所选记录以去重 Toast 呈现，列表状态与重试入口保持持久可见。

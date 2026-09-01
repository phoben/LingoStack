# LingoStack 当前 UI 设计主契约

## 1. 适用范围与证据优先级

本规范描述已实现的 Tauri 主窗口，不是旧原型的重建说明。规则冲突时按以下顺序裁定：

```text
当前生产源码：src/、src/index.css、tailwind.config.ts、src-tauri/tauri.conf.json
  > 已落地的 Trellis 规范与产品决策
  > .claude/skills/lingostack-design/ 原始设计包
```

设计包只能解释当前代码尚未覆盖且与源码不冲突的意图。它不能恢复固定侧栏、底部状态栏、流式闪烁光标、内部嵌套卡片、760px 顶部导航或网络字体加载。

体验目标是安静、紧凑、精密、内容优先：低噪声的语义色和发丝分割线服务内容与操作，不为每个区块制造容器。

## 2. 桌面窗口和应用骨架

- `src-tauri/tauri.conf.json`：默认窗口 `1080×720`，最小 `864×576`，可缩放、无系统装饰。
- `src/components/title-bar.tsx:70-128`：44px 自定义标题栏，左侧品牌，右侧主题和窗口控制。
- `src/App.tsx:55-65`：标题栏与侧栏共享 `bg-background`；右侧只有一个 `rounded-xl border border-border/60 bg-surface shadow-ring` 主面板。
- `src/lib/sidebar-layout.ts:8-23`、`sidebar.tsx:21-126`：侧栏可拖拽、双击切换和键盘调整，宽度 60–280px、默认 188px，低于 132px 隐藏文案；当前项以背景和 2px 指示条表示，不加独立折叠按钮。

## 3. 视觉令牌和密度

颜色必须来自 `tailwind.config.ts:32-84` 映射的 CSS 语义变量（定义在 `src/index.css:11-103`）。使用 `background` / `foreground` / `border` / `muted` / `accent` / `primary` / `destructive` 表达界面层级，使用 `surface` / `surface-2` 表达表面，`info` 表达焦点和信息性交互，`success` / `warning` 表达结果语义；禁止散落具体主题色。

`tailwind.config.ts:13-30` 定义系统字体回退：本地有才命中 `Inter` / `JetBrains Mono`，运行时不加载网络字体。正文与控件以 12–14px 为主；代码标识符、模型 ID、版本、键帽和微标签使用 `font-mono`。圆角由 `--radius: 12px` 派生（`sm` 6、`md` 10、`lg` 12、`xl` 14px）；阴影优先 `shadow-ring` / `shadow-focus` 等令牌，不自造重投影。

动效只使用 `ease-app`、`duration-fast`（150ms）和 `duration-base`（220ms）；`ViewShell` 使用 `animate-panel-in`。hover 可提亮背景或边框，必须保持文字对比；仅 disabled 可整体降低对比；选中或成功图标可用 `text-success`。

## 4. 布局与内容层级

主面板内用留白和 1px 语义分割线，不增加第二层 `rounded + border + background` 卡片。`ViewShell`（`src/components/view-shell.tsx:12-31`）提供可选 toolbar（`border-b border-border`）和无默认内边距的内容区，让分割线到达面板边缘。

| 使用场景                 | 当前组合                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- |
| 翻译双栏                 | 父级 `divide-x divide-border`（`translate-view.tsx:238-286`）                 |
| 命名五列和列内行         | `divide-x divide-border` 与 `divide-y`（`naming-view.tsx:88-126`）            |
| 文档列表 + Markdown 阅读 | 220px 列表与连续 Markdown 阅读区间竖线；导入按钮紧邻原文/译文切换             |
| 收藏列表、提供商或功能行 | 容器 `divide-y divide-border`；hover 如 `hover:bg-accent/40`                  |
| 设置分节                 | `SetSection` 的 `border-b border-border`；行表接标题只加 `border-t`，避免双线 |

合法例外：`provider-form.tsx` 等内联展开编辑区可用 `border-y border-border` 标示编辑范围，仍不加圆角卡片。

### Wrong vs Correct

```tsx
// Wrong：在单层主面板内又创建视觉卡片
<section className="rounded-lg border border-border bg-background p-4">...</section>

// Correct：让分割线和留白表达两个相邻内容区
<div className="divide-y divide-border">
  <section className="px-4 py-3">...</section>
  <section className="px-4 py-3">...</section>
</div>
```

## 5. 交互和内容状态矩阵

| 状态            | 可观察表现                                 | 语义/实现要求                                                                                       |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| default         | 语义色、紧凑文字与分割线清晰区分           | 复用现有原语和 token                                                                                |
| hover           | 行或控件背景/边框轻微提亮                  | 不以降文字对比作反馈                                                                                |
| focus           | 明确 info 双层焦点环                       | 键盘可达，使用 `focus-visible`                                                                      |
| active/selected | 导航背景 + 2px 指示条；开关/单选有选中反馈 | 导航 `aria-current="page"`；开关 `aria-pressed`；互斥模式用 `radiogroup` / `radio` + `aria-checked` |
| disabled        | 仅不可用时降低整体对比                     | 保留原生 disabled 语义，不能伪装可用                                                                |
| loading         | 保持结果位置，标明正在进行                 | 异步容器 `aria-busy`，避免流式光标旧原型                                                            |
| empty           | 在内容区明确说明无结果/无条目              | 不用空卡片填充空间                                                                                  |
| error           | 错误语义色和可读文案                       | 紧急失败为 `role="alert"`                                                                           |
| success         | 成功文本或图标反馈                         | 可用 `text-success`，不只靠颜色                                                                     |

非紧急异步结果使用 `aria-live="polite"`。翻译、命名和收藏已有此模式；设置与提供商表单仍是缺口，详见 [测试与可访问性](./testing-and-a11y.md)。

### 文档阅读器

- `DocsView` 只呈现一篇连续 Markdown，可切换原文/译文。用户点击列表项时，已完成记录默认进入译文，其余状态默认进入原文；导入成功并启动翻译的新记录自动进入译文。内部翻译片段、术语和 generation 不进入 React interface。
- toolbar 左置原文/译文，并在其右侧紧邻唯一导入按钮；左栏不再为导入操作保留底部容器，格式/上限长说明也不占 toolbar。
- 当前文档动作靠 toolbar 右侧排列；列表项视觉上只保留状态图标和文件名，不显示状态文字、百分比、片段数、双栏/单栏、逐片段复制或四格式导出矩阵。完整本地化状态写入列表项可访问名称。
- 文件选择器和拖放都遍历全部受支持文件；每个文件独立进入既有导入/翻译链路，单个失败必须可见且不能阻断同批其他文件。
- parsing / translating 列表项使用轻量活动图标，其余状态使用静态文件图标；动画使用现有语义 token，并通过 `motion-reduce:animate-none` 降级。动画只承担视觉提示，文件名与本地化状态必须组合进列表项的 `aria-label`。
- 当前视图为译文且所选记录处于 `translating` 时，reader 内显示 `absolute inset-0` 覆盖式加载层；加载层有 `role="status"` / `aria-live="polite"` 和可读文案，父区域同步 `aria-busy=true`。此时不渲染源文、局部译文或旧占位；完成后原位显示完整译文，失败/取消后立即退出加载层。
- Markdown 必须使用现有语义 token 显式设置 heading/list/quote/table/code/link 样式；未配置 typography plugin 时不得只写 `prose` 类假定其生效。
- raw HTML 默认禁用；链接只允许 `http`、`https`、`mailto`，复制/导出使用 Markdown 源而不是 DOM text。
- 原文/译文是一个互斥的 segmented radio group，视觉与 DOM 顺序固定为原文→译文；选中项高亮且只有当前项进入 Tab 顺序。Home/ArrowLeft 指向原文，End/ArrowRight 指向译文。用户手动切换当前记录时不得被状态 effect 抢回；只有列表项选择或新导入成功这两个明确事件应用自动视图策略。

### 设置与关于页

- AI 功能模型行使用面向用户的短 Label；翻译、命名和文档行的空值均明确为使用全局默认模型，文档行固定为“文档” / “Document”且配置仍写入 `models.doc_translate`；全局默认自身的空值为未指定。
- 外观面板不得直接展示 `system` / `light` / `dark` 或 Prompt feature key；使用本地化 Label、明确表单关联和一致的纵向 gap。
- 关于页不使用 toolbar 标题区；内容区居中展示现有 `brand-mark`、产品描述与更新检查入口。能力未实现时按钮必须 disabled 并明确“即将支持”，不得伪造网络更新行为。

### 桌面右键菜单

- Tauri 主窗口全局阻止 WebView/浏览器原生 `contextmenu`，需要右键操作的区域必须提供应用内菜单，不能回退到浏览器菜单。
- 应用内菜单使用现有 `surface` / `border` / `accent` / `destructive` token，`role="menu"` / `menuitem`，打开后聚焦第一个可用项；ArrowUp/Down、Home/End、Escape、外部点击可操作。
- 菜单位置必须夹取在可视窗口内，并在窗口滚动或缩放时关闭，避免浮层留在错误内容上。
- 文件列表菜单先选中右键目标，再按原文→译文顺序提供阅读模式与二次确认删除；删除不得复制出另一条弱确认路径。
- Markdown 阅读区菜单在打开瞬间快照选中文字，再提供复制所选、复制当前完整 Markdown、全选。不要等点击菜单项后再读取实时选区，WebView 焦点变化可能已折叠选区。

```tsx
// Wrong：点击菜单项时才读取 selection，且把菜单定位值原样写入屏幕坐标
const text = window.getSelection()?.toString();
style={{ left: event.clientX, top: event.clientY }};

// Correct：右键时快照选区，菜单测量后夹取到 viewport
setMenu({ selectedText: window.getSelection()?.toString(), x, y });
setPosition(clampToViewport({ x, y }, menuRect));
```

## 6. 桌面适配与 overflow

这是最小 `864×576` 的可缩放桌面应用，不承诺响应式网页断点。当前通过可调宽/图标态侧栏、toolbar 换行、局部截断、内容滚动和个别 `sm:` 控制适配。命名五列允许内容区内部滚动；不要承诺所有宽度都禁止水平滚动，也不要在 760px 以下改顶部横向导航或堆叠双栏。

### 术语浮层与收藏长文本

- 术语解释必须 portal 到 `document.body`，使用 `position: fixed` 与顶层 z-index；不得把 absolute tooltip 留在翻译滚动容器内。浮层优先显示在 tag 下方，空间不足时翻到上方，水平位置至少保留 8px viewport 边距，并在祖先滚动、窗口缩放时重新测量。
- 术语 tag 由文本按钮与独立收藏按钮组成；收藏按钮使用空心/实心书签、`aria-pressed`、加载/写入期间 disabled，不能让点击收藏顺带改变 tooltip 或翻译正文布局。
- 收藏行固定为“内容区 + 操作栏”；内容区内部原文/释义使用 `minmax(0, 2fr)` / `minmax(0, 3fr)`，所有可伸缩节点必须 `min-w-0`，长连续 token 使用 `overflow-wrap:anywhere`，操作栏不得被挤出可视区。
- 原文与释义默认最多三行。只有实际 `scrollHeight > clientHeight` 时显示“展开”，展开后显示完整内容并切为“收起”；使用 `ResizeObserver` 与窗口 resize 重新判断，不按字符数猜测溢出。

```tsx
// Wrong：长文本参与 min-content 计算，tooltip 也撑开滚动容器
<div className="flex"><span>{term}</span><span className="absolute">{tip}</span></div>

// Correct：有界网格 + 顶层 fixed portal
<div className="grid grid-cols-[minmax(0,1fr)_auto]">...</div>
{createPortal(<span className="fixed z-50">{tip}</span>, document.body)}
```

## 7. 场景边界

### 瞬时消息提醒

- 应用根部只挂载一个顶部居中的 Toast 区域，`position="top-center"` 且 `offset={16}`。复制、收藏、导入、导出、删除和显式保存等离散结果使用它；成功约 1.6 秒，失败可延长，最多同时三条。
- Toast 使用既有语义 token、图标和本地化名称，不抢夺焦点；`prefers-reduced-motion` 时关闭位移动画。
- 流式/文档进度、数据加载错误、字段校验和热键冲突必须保留在原业务区域，不与 Toast 重复播报。文档翻译的持久失败原因是例外：原因仍由 Rust 快照持久化，但当前所选记录的每次新失败只 Toast 一次；列表继续保留失败状态和重试入口，reader 不重复显示原因。

| 判断 | 场景                                                       | 做法                                                  |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------- |
| Good | 在翻译、收藏或设置中新增一组相邻内容                       | 用 toolbar / 分割线 / 行 hover，复用语义 token 和原语 |
| Base | 新增只属于一个页面的编辑流程                               | 保留页面局部组件，可用 `border-y` 限定内联编辑范围    |
| Bad  | 为“更明显”把每个分节包装成圆角背景卡片，或按旧原型固定侧栏 | 拒绝；会破坏单层主面板与可调侧栏契约                  |

## 8. UI 变更验收

提交前逐项确认：

- 新颜色、圆角、阴影、时长和 easing 均为现有 token；没有硬编码主题色或第二套组件风格。
- 页面仍为 44px 标题栏 + 可调侧栏 + 单层主面板；内部以分割线组织，只有内联编辑例外。
- 每个新增可交互控件可键盘操作、有可见焦点和正确原生/ARIA 语义；新增异步区有 busy、成功/空态与错误的可观察文案及 live/alert 语义。
- 全局禁用原生右键时，逐个验收需要右键的业务区域已有应用内替代；菜单在窗口四角、键盘导航、选区复制和关闭清理场景均有测试。
- 在最小窗口下验证无意外遮挡：工具条可换行，必要时内容区滚动或截断；不宣称未实现的网页响应式。
- 静态核对引用的组件、class 与 token 存在；运行了什么检查就报告什么，未运行视觉回归不得称视觉已验证。

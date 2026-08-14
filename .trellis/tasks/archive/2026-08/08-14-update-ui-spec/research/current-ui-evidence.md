# 当前 UI 证据基线

## 证据优先级

1. 当前生产源码 `src/`、`tailwind.config.ts`、`src-tauri/tauri.conf.json`
2. 已落地的 Trellis 规范与提交决策
3. `.claude/skills/lingostack-design/` 原始设计包，仅用于解释仍与源码一致的设计意图

冲突时以更高优先级为准。原始设计包不是当前产品像素状态的替代品。

## 当前实现已确认的契约

### 应用骨架与窗口

- `src-tauri/tauri.conf.json`：默认窗口 1080×720，最小 864×576，可缩放、无系统装饰。
- `src/components/title-bar.tsx:70-128`：44px 自定义标题栏，左侧品牌，右侧主题与窗口控制。
- `src/App.tsx:55-65`：标题栏与侧栏共用窗口背景；右侧只有一个圆角、描边、抬升主面板。
- `src/lib/sidebar-layout.ts:8-23`：侧栏宽度 60–280px，默认 188px，低于 132px 隐藏文字；
  不是旧原型中的固定侧栏。
- `src/components/sidebar.tsx:21-126`：侧栏支持拖拽、双击切换宽度与键盘调整，选中项用背景
  与 2px 发丝指示条，不使用独立折叠按钮。

### 页面层级与分区

- `src/components/view-shell.tsx:12-31`：视图统一为可选工具条 + 无默认内边距的内容区。
- `src/components/views/translate-view.tsx:238-286`：翻译页双栏用 `divide-x`。
- `src/components/views/naming-view.tsx:88-126`：命名页五列用 `divide-x`，列内行用 `divide-y`。
- `src/components/views/docs-view.tsx:140-190`：文档页 220px 历史栏 + 预览区，以竖线分隔。
- `src/components/views/favorites-view.tsx:139-201`：消息与列表均用横向分割线，行 hover 提亮背景。
- `src/components/views/settings-view.tsx:59-81`、`src/components/settings-ai.tsx:121-229`：设置分节和
  行表以横线组织；内联 `provider-form` 可用上下边界线，但仍不是卡片。

结论：主面板内采用分割线与留白建立层级，不恢复 `rounded + border + background` 的嵌套卡片。

### 视觉令牌与密度

- `src/index.css:11-103`：浅色、深色语义令牌；深色最接近原始高保真设计，浅色为同语义推导。
- `tailwind.config.ts:30-108`：颜色全部映射 CSS 变量；圆角由 12px 基准派生；动效仅使用
  `duration-fast=150ms`、`duration-base=220ms` 与 `ease-app`。
- `src/index.css:106-180`：系统字体回退、字偶距、焦点、选区、滚动条、品牌标、抬升环与键帽。
- 当前正文与控件以 12–14px 为主；代码标识符、模型 ID、版本、键帽、面板微标签使用 mono。
- 当前运行时不加载网络字体；`Inter` 与 `JetBrains Mono` 仅在本地可用时命中，否则回退系统字体。

### 原语与状态

- `src/components/ui/button.tsx`：`Button` 有 5 个变体、4 个尺寸；默认按钮为主操作，图标按钮
  使用 `ghost` + `icon` 或局部缩小尺寸。
- `src/components/ui/input.tsx`、`textarea.tsx`、`select.tsx`：原生控件语义、`forwardRef`、统一
  输入边框和 info 焦点环；`Select` 刻意保留原生选择器。
- `src/components/ui/pill.tsx`：状态标签按语义色映射，不作为交互控件。
- hover 提亮背景或边框且保持文字对比；disabled 才允许整体降对比；图标选中/成功反馈可使用
  `text-success`。

### 异步状态与可访问性

- `translate-view.tsx:275-284`：译文区域使用 `aria-live="polite"`、`aria-busy`，错误用
  `role="alert"`。
- `naming-view.tsx:73-145`：生成区域使用 `aria-live`、`aria-busy`，错误用 `role="alert"`。
- `favorites-view.tsx:140-154`：通知使用 `aria-live`，错误使用 `role="alert"`。
- 图标按钮使用 `aria-label`；选中导航使用 `aria-current="page"`；开关型按钮使用
  `aria-pressed`；装饰图标使用 `aria-hidden`。
- 当前缺口：设置加载/保存、提供商表单等部分异步文本尚未统一 live region；设置二级导航不是
  完整 ARIA tabs；无自动化 axe 门禁。

### 桌面适配边界

- 当前是最小 864×576 的可缩放桌面窗口，不是响应式网站。
- 现有适配机制是可调宽/图标态侧栏、工具条换行、局部截断、内容滚动以及个别 `sm:` 控制；
  没有实现旧设计包所称的 760px 以下顶部导航或双栏堆叠。
- 命名五列允许内容区内部滚动；不应把“所有视口禁止水平滚动”的网页交付规则写成现状。

## 已过时的设计包规则

以下只保留为历史参考，不得写成当前实现要求：

- 固定 188px 侧栏
- 底部状态栏和模型/CPU/内存微文案
- 主面板内部嵌套卡片
- 流式输出闪烁光标
- 760px 以下切换为顶部横向导航
- 运行时从 Google Fonts 加载字体

## 需要修订的现有规范

- `.trellis/spec/lingostack-app/frontend/index.md` 仍称 `aria-live` 是全站缺口。
- `.trellis/spec/lingostack-app/frontend/testing-and-a11y.md` 仍称全站没有 live region。
- `.trellis/spec/lingostack-app/frontend/components-and-styling.md` 已记录分割线方案，但缺少完整
  应用骨架、设计证据优先级、桌面适配边界、视觉状态矩阵与页面组合契约。

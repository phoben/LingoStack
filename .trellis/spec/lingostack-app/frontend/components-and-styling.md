# 组件与样式

视觉效果、布局层级、状态与窗口边界以 [UI 设计主契约](./ui-design.md) 为准；本文只规定其 React/Tailwind 实现方式。发生冲突时，先回到当前 `src/`、`src/index.css`、`tailwind.config.ts`，不按旧原型回退。

## `ui/` 原语是手写的，不是 shadcn 生成物

`src/components/ui/` 的 `Button`、`Input`、`Textarea`、`Select`、`Pill` 都是手写实现；没有 `@radix-ui/*` 与 `class-variance-authority`。不要直接 `npx shadcn add`，否则会在当前项目并存两套原语模式。需要新原语时延续手写模式；若要迁移，应单独决策并整体规划。

`Button` / `Input` / `Textarea` / `Select` 均应：

- `forwardRef`，继承对应原生 HTML 属性，保留并展开 `{...props}`；
- 单独取出 `className`，用 `cn()` 合并；`cn()` 是 `src/lib/utils.ts:5-7` 的 `twMerge(clsx(inputs))`；
- 使用 `tailwind.config.ts` 的语义 token，例如 `border-border`、`focus-visible:ring-info/40`，不散落主题色。

`Pill` 是状态文本的 `<span>`，不是按钮或表单控件；不要用它承载可点击操作。`Select` 刻意保留原生 `<select>` 的键盘和表单语义，不能以自绘下拉替换。

`Button` 的变体和尺寸继续使用穷尽的手写查表（`button.tsx:19-34`）：`Record<ButtonVariant, string>` 与 `Record<ButtonSize, string>`。当前有 5 个变体、4 个尺寸；主操作用默认变体，图标操作用 `ghost` + `icon` 或局部缩小尺寸。

## 页面组合与复用边界

先用 `ViewShell` 组合视图：其可选 `toolbar` 是顶部操作行，内容区默认无内边距（`src/components/view-shell.tsx:3-31`）。工具条、分栏、行表、分节的视觉规则见 UI 主契约；实施时优先复用已有原语和分割线类，例如 `divide-x divide-border`、`divide-y divide-border`、`border-b border-border`。

抽为共享原语的条件：相同语义、交互和状态规则被两个以上位置稳定复用，且能由原生属性表达。保留页面局部组件的条件：只服务一个视图的业务结构、数据或编辑流程，例如 `provider-form.tsx` 的内联提供商编辑。不要为视觉独立而包装第二层 `rounded + border + bg-*` 卡片。

视图路由无路由库：`AppView` / `activeView` 在 `stores/app-store.ts`；`src/lib/view-meta.ts` 的 `VIEW_ORDER` 与 `VIEW_META` 是顺序、标签、说明和图标的唯一真源；`App.tsx` 条件挂载视图。新增视图依次更新：`AppView`、`VIEW_ORDER`、`VIEW_META`、`App.tsx` 的条件渲染，并使用 `<ViewShell toolbar={...}>`。

设置页二级导航是 `settings-view.tsx` 内的局部状态，不进入 app store 或 view-meta，也不是可复制到其他视图的通用 tabs。

## 主题接线与动效实现

`tailwind.config.ts` 使用 `darkMode: ["class"]`；`useApplyTheme()` 在 `App.tsx` 根部调用，根据 store 的 `mode` 切换 `<html>` 的 `.dark`，system 模式监听 `matchMedia`。`index.html:7-19` 在 React 挂载前用同一 localStorage key 预置主题，避免闪烁；`lingostack.theme` 同时写在 `index.html` 与 `theme-store.ts`，修改必须同步。

使用 `transition-colors duration-fast ease-app`（见 `button.tsx`），而非原生 duration/easing；视图切换由 `ViewShell` 的 `animate-panel-in` 完成。令牌细节、字体回退及状态可访问性见主契约和测试规范。

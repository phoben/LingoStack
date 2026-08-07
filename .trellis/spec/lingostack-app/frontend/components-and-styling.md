# 组件与样式

> 写任何组件、页面、样式前，先调用 `/lingostack-design` 技能熟悉设计规范与原型稿，优先按原型实现；原型未覆盖的场景才自行设计，且须与既有视觉规范一致。

## `ui/` 原语是手写的，不是 shadcn 生成物

`components.json` 存在，但 `src/components/ui/` 下的原语**全部手写**：

- 无 `@radix-ui/*` 依赖
- 无 `class-variance-authority`
- 各文件注释写明是过渡实现（`button.tsx:9`、`input.tsx:5-7`、`textarea.tsx:5-7`：「V1 引入 shadcn 完整组件时可平滑替换」）

**直接 `npx shadcn add <component>` 会引入 Radix + cva 风格的组件，与现有手写原语两套模式并存。** 需要新原语时先决定：跟随现有手写风格，还是启动一次整体迁移（那是独立技术决策）。

CLAUDE.md 里「新增组件默认走 shadcn/ui」是目标状态，与当前代码不一致——按本文档的实际情况办。

## 原语写法

表单类原语（`Button` / `Input` / `Textarea` / `Select`）统一：`forwardRef` + 直接继承原生 HTML 属性接口 + 展开 `{...props}` + `className` 单独取出交 `cn()` 合并。

`Pill` 是 `<span>`，非表单控件，用普通函数组件、无 `forwardRef`（`pill.tsx:22-27`）。

变体用**手写查表**，不用 cva（`button.tsx:19-34`）：

```ts
const VARIANT: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  // ...
};
const SIZE: Record<ButtonSize, string> = { sm: "...", md: "...", lg: "...", icon: "..." };
// 组合：cn(baseClasses, VARIANT[variant], SIZE[size], className)
```

`Record<Variant, string>` 保证加变体时不会漏——类型会报错。加新原语照这个形状写。

`cn()` 在 `src/lib/utils.ts:5-7`，就是 `twMerge(clsx(inputs))`。**所有拼类名的地方都用它**，不要手工拼字符串。

`Select` 刻意用原生 `<select>` 而非自绘列表（`select.tsx:6-7`：桌面端保留键盘与表单语义）。不要替换成自定义下拉。

## 视图路由

无路由库，纯状态驱动。

- `AppView` 联合类型与 `activeView` 在 `stores/app-store.ts:7-13`
- **`lib/view-meta.ts` 是视图元信息的唯一真源**：`VIEW_ORDER`（展示顺序，`:31-38`）+ `VIEW_META`（`id`/`label`/`description`/`icon`，`:40-77`）
- `Sidebar` 与 `ViewShell` 都从这里读，标签不重复定义
- `App.tsx:57-64` 用一串 `activeView === "x" ? <XView /> : null` 渲染，未命中的视图返回 `null`（不是隐藏，是不挂载）
- 六个视图全部静态 import，无懒加载

**加视图的动作**：`AppView` 加成员 → `VIEW_ORDER` 加顺序 → `VIEW_META` 加元信息 → `App.tsx` 加一行条件渲染 → 视图组件用 `<ViewShell view="...">` 包裹。

`ViewShell`（`view-shell.tsx:18-40`）提供每个视图的统一外壳：从 `VIEW_META` 取标题与描述，一个右上角 `actions` 插槽（用法见 `favorites-view.tsx:75-104`），内容区。

设置页有**自己的二级标签**，是组件内 `useState`，不进 app store、不进 view-meta（`settings-view.tsx:9-16,72`）。这套二级机制不可复用，别照抄到其他视图。

## Tailwind 令牌

`tailwind.config.ts`。颜色全部走 `hsl(var(--token))` 间接层（`:32-84`）。除 shadcn 标准令牌外的自定义语义色：

- `surface` / `surface-2`（`:68-71`）
- `info`（`:73-76`）—— 原型的主交互色，用于焦点、链接、流式态、保留词高亮
- `success` / `warning`（`:77-84`）

圆角从单一 `--radius`（12px，`index.css:48`）派生：`sm` = −6px、`md` = −2px、`lg` = 基准、`xl` = +2px（`:86-92`）。

**动效用自定义令牌，不用 Tailwind 原生的**（`:100-108`）：`ease-app`、`duration-fast`（150ms）、`duration-base`（220ms）。写法见 `button.tsx:51` 的 `transition-colors duration-fast ease-app`。

自定义阴影 `ring` / `focus` / `sm` / `md`（`:94-99`），其中 `ring`/`focus` 解析到随主题变化的 CSS 变量（暗色下是双层 ring，见 `index.css:92-93`）。

`panel-in` 动画（淡入 + 轻微上移）由 `ViewShell` 在每次切视图时用（`view-shell.tsx:21`）。

## 主题

`darkMode: ["class"]`，靠 `<html>` 上的 `.dark` 类切换。

`hooks/use-theme.ts` 的 `useApplyTheme()` 在应用根调用一次（`App.tsx:25`），订阅 store 的 `mode`，在 effect 里 `classList.toggle("dark", ...)`（`:29`）。`mode === "system"` 时额外挂 `matchMedia` 的 `change` 监听以跟随系统实时切换（`:35-37`），卸载时清理。

**防闪烁**：`index.html:7-19` 有一段 React 挂载前执行的同步内联脚本，读同一个 localStorage key 提前加 `.dark`。

`lingostack.theme` 这个 key 写在两处（`index.html:9,12` 与 `theme-store.ts:10`），靠注释同步。改一处必须改另一处。

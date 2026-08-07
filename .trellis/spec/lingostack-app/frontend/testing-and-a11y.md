# 测试与可访问性

## Vitest 配置

`vite.config.ts:32-37`：`globals: true`、`environment: "jsdom"`、`setupFiles: ["./src/test-setup.ts"]`、`css: true`。

`src/test-setup.ts` 做两件事：引入 `@testing-library/jest-dom/vitest`（提供 `toHaveAttribute` 等 DOM 匹配器）；**手动桩 `window.matchMedia`**（`:4-16`），jsdom 不实现它，默认 `matches: false`（即浅色），所以 `system` 主题在测试里解析为 light（`use-theme.test.ts:13-15` 注释说明）。

`globals: true` 已开，但现有文件仍显式 `import { describe, it } from "vitest"`。两种都能跑，新文件跟随显式 import 的多数写法。

## mock 边界

只 mock Tauri 边界，不 mock 自己的模块：

```ts
// config-store.test.ts:4-9
vi.mock("@tauri-apps/api/core", () => ({ invoke: ..., Channel: ... }));
// title-bar.test.tsx:14-16
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: ... }));
```

`vi.mock` 要提在 import 之上（hoisted），`config-store.test.ts:3` 有注释说明。

## 组件测试

RTL：`render` / `screen` / `fireEvent`。查询优先 `getByRole("button", { name })`（`sidebar.test.tsx`），断言 `aria-current` 之类语义属性而非类名。

有 effect 里的异步 promise 时用 `findByRole` 顺带冲掉它，避免 `not wrapped in act(...)` 警告（`title-bar.test.tsx:25-26` 写明了这个手法）。

`use-theme.test.ts` 用 RTL 的 `renderHook` 测 hook。

测模块加载期行为用 `vi.resetModules()` + 动态 `await import(...)`（`theme-store.test.ts:43-65`，测 localStorage 有值/无值/非法值三种初始化）。全站唯一用到这招的地方，需要时照抄。

## 命名语言

现状混合：`describe` 基本英文（`"cn"`、`"config-store"`、`"Sidebar"`）；`it` 在业务逻辑测试里多为中文（`"load 从后端拉取配置"`），在组件交互测试里多为英文（`"minimize button calls window.minimize"`）。

无强制规则。跟随所在文件的既有语言，别在一个文件里混用。

## 覆盖现状

9 个测试文件。**已覆盖**：`lib/utils`、`lib/naming`、`lib/favorites`（纯逻辑最完整，含 `parseImport` 的畸形输入用例）、`stores/app`、`stores/theme`、`stores/config`、`hooks/use-theme`、`components/sidebar`、`components/title-bar`。

**零覆盖**（改这些地方没有测试会拦住你）：

- `lib/favorites-db.ts` —— jsdom 无 IndexedDB，要测得先引 `fake-indexeddb` 之类
- `stores/favorites-store.ts`
- 全部 `components/views/`（六个视图）
- `provider-form.tsx`、`settings-ai.tsx`
- 全部 `ui/` 原语
- `App.tsx`、`view-shell.tsx`、`status-bar.tsx`

新功能必须带测试。视图组件难测时，把逻辑抽成 `lib/` 下的纯函数再测——`favorites.ts` 与 `favorites-db.ts` 的分层就是这个思路的样板。

## a11y 既有约定

照着做，这些是全站一致的：

- 图标按钮必须有 `aria-label`（`translate-view.tsx:228,238,250`、`title-bar.tsx:40,107`、`favorites-view.tsx:114,181,189`）
- 导航/标签的选中态用 `aria-current="page"`（`sidebar.tsx:33`、`settings-view.tsx:89`、`docs-view.tsx:95`），且有测试守护（`sidebar.test.tsx:20-26`）
- 开关型按钮用 `aria-pressed`（`naming-view.tsx:123`、`favorites-view.tsx:124`、`docs-view.tsx:134`）
- 装饰元素 `aria-hidden="true"`（`status-bar.tsx:10`、`sidebar.tsx:18,44`）
- 地标加标签：`<nav aria-label="主导航">`（`sidebar.tsx:23`）
- 用原生语义元素：真 `<select>`、`<label htmlFor>` 配 `<input id>`（`provider-form.tsx:63-70`）
- 焦点样式双层：全局 `:focus-visible` 描边（`index.css:140-144`）+ 各原语的 `focus-visible:ring-2 focus-visible:ring-info/40`

## a11y 缺口

**全站没有一处 `aria-live` / `role="status"` / `role="alert"`。** 而以下区域都会异步变化，屏幕阅读器用户完全听不到：

- 翻译视图的流式状态徽标与结果（`translate-view.tsx:51-59`）
- 命名视图的流式光标与错误块（`naming-view.tsx:169-186`）
- 收藏视图的提示与错误文本（`favorites-view.tsx:138-143`）

**新增任何异步状态区域，加 `aria-live="polite"`（错误用 `role="alert"`）。** 碰到上述三处时顺手补上。

其他已知缺口：

- 侧栏、设置二级标签、各类 pill 开关都是手工 `aria-pressed`/`aria-current` 的普通 `<button>`，没有 `role="tablist"`/`tab` 语义，也没有方向键漫游焦点。点击与 Enter 可用，但不是完整 ARIA 标签模式。
- `docs-view.tsx:150,153,156` 三个图标按钮是占位（`title="V1 实装"`、无 `onClick`）但仍可聚焦，键盘用户会 tab 到死按钮。
- 无自动化 a11y 检测（未装 `jest-axe` 等），全靠人工遵守。

## 其他待清理

`docs-view.tsx:166,175` 用数组下标当 React key。当前数据是硬编码演示内容所以无害，但该视图注释写明业务能力留待 V1.5——**真接数据时必须改成稳定 key**。

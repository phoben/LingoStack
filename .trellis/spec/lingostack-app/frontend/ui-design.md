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
| 文档历史栏 + 预览        | 220px 历史栏与预览间竖线（`docs-view.tsx:140-190`）                           |
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

| 状态            | 可观察表现                            | 语义/实现要求                                   |
| --------------- | ------------------------------------- | ----------------------------------------------- |
| default         | 语义色、紧凑文字与分割线清晰区分      | 复用现有原语和 token                            |
| hover           | 行或控件背景/边框轻微提亮             | 不以降文字对比作反馈                            |
| focus           | 明确 info 双层焦点环                  | 键盘可达，使用 `focus-visible`                  |
| active/selected | 导航背景 + 2px 指示条；开关有选中反馈 | 导航 `aria-current="page"`；开关 `aria-pressed` |
| disabled        | 仅不可用时降低整体对比                | 保留原生 disabled 语义，不能伪装可用            |
| loading         | 保持结果位置，标明正在进行            | 异步容器 `aria-busy`，避免流式光标旧原型        |
| empty           | 在内容区明确说明无结果/无条目         | 不用空卡片填充空间                              |
| error           | 错误语义色和可读文案                  | 紧急失败为 `role="alert"`                       |
| success         | 成功文本或图标反馈                    | 可用 `text-success`，不只靠颜色                 |

非紧急异步结果使用 `aria-live="polite"`。翻译、命名和收藏已有此模式；设置与提供商表单仍是缺口，详见 [测试与可访问性](./testing-and-a11y.md)。

## 6. 桌面适配与 overflow

这是最小 `864×576` 的可缩放桌面应用，不承诺响应式网页断点。当前通过可调宽/图标态侧栏、toolbar 换行、局部截断、内容滚动和个别 `sm:` 控制适配。命名五列允许内容区内部滚动；不要承诺所有宽度都禁止水平滚动，也不要在 760px 以下改顶部横向导航或堆叠双栏。

## 7. 场景边界

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
- 在最小窗口下验证无意外遮挡：工具条可换行，必要时内容区滚动或截断；不宣称未实现的网页响应式。
- 静态核对引用的组件、class 与 token 存在；运行了什么检查就报告什么，未运行视觉回归不得称视觉已验证。

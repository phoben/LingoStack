# Provenance — 译栈 LingoStack Design System

How every token, pattern, and asset in this package traces back to the copied
source prototypes. Generated 2026-08-06 from the five files listed in
`context/source-context.md`.

## Source files

| File | Role | Key evidence extracted |
| --- | --- | --- |
| `main-window.html` (54KB) | 主窗口，六标签 | App shell, sidebar nav, translation split-pane, naming, document viewer, favorites, settings (LLM providers / hotkeys / prompt), statusbar, toast |
| `selection-bar.html` (18KB) | 划词工具栏 | PopClip 五键动作条、popIn 动画、内联翻译揭示 |
| `translation-popup.html` (15KB) | 翻译浮窗 | 浮窗 chrome、流式渲染、keep 术语、live 圆点、动作行 |
| `term-explanation.html` (15KB) | 词条解释 | 模态弹窗、词头/音标/词性、例句、相关术语标签 |
| `index.html` (18KB) | 总览 / 落地页 | Hero、interface cards、设计原则、footer；含 `--accent-active`、`--danger`、`--radius-md:12` 等补充值 |

## Token provenance

All identity values are read verbatim from source `:root` blocks; no color was
invented. Where the five files disagreed on a non-identity value, the most
frequently used / most complete declaration wins (noted below).

| Token | Value | Source |
| --- | --- | --- |
| `--bg` `#07080a` | all five files | identical across prototypes |
| `--surface` `#101111` | all five files | identical |
| `--surface-warm` `#161719` | `main-window.html` (`--surface-2`) | main-window defines the 2nd surface; index aliases `--surface-warm:var(--surface)`. Bound to the richer tier. |
| `--fg/--fg-2/--muted/--meta` | all five files | identical |
| `--accent` `#FF6363` | all five files | coral brand accent |
| `--accent-hover` `#ff7777` | `index.html`, `selection-bar.html` | hover offset |
| `--accent-active` `#e85757` | `index.html` | active offset (only index declares it) |
| `--info` `hsl(202,100%,67%)` | all five files | sky-blue operational signal |
| `--success/warn/danger` | all five / index | success/warn identical; `--danger:hsl(0,100%,69%)` only in index |
| type scale | `index.html` (most complete: 12/14/16/18/20/24/40/60) | main-window uses a denser 15-base scale for the app shell; the canonical web scale follows index.html |
| spacing 4–48 | all five files | identical 4px grid |
| radius sm/md/lg/pill | index (6/12/16/9999) | main-window uses 6/10/12 locally; canonical set follows index |
| `--elev-ring` double-ring | all five files | signature `rgb(27,28,30) 0 0 0 1px, rgb(7,8,10) 0 0 0 1px inset` |
| `--focus-ring` | all five files | `0 0 0 3px hsla(202,100%,67%,.35)` |
| motion 150/220 + ease | all five files | identical |

## Pattern provenance

- **品牌印记斜纹** — `.brand-mark::after { repeating-linear-gradient(115deg, transparent 0 2px, var(--accent) 2px 4px, transparent 4px 8px); opacity:.85 }` (main-window + index). Recreated as `assets/brand-mark.svg`.
- **流式渲染光标** — `.cursor` 1px×1.05em 天蓝 `@keyframes blink` (main-window, translation-popup).
- **PopClip 动作条** — `.popbar` + `popIn` keyframe + 三角指示尾 (selection-bar).
- **macOS 红绿灯标题栏** — `.titlebar` / `.tl` (main-window) / `.app-titlebar` (selection-bar) / `.fw-titlebar` (popup).
- **侧栏 active 发丝条** — `.nav-item.active::before` 2px 左竖条 (main-window).
- **kbd 键帽** — `.kbd` 渐变 + 三层阴影 (main-window 热键设置).
- **状态药丸** — `.pill.ok/.warn` `color-mix` 12% 底 (main-window 提供商).

## Assets

- `assets/brand-mark.svg` — 品牌印记（48 视口），SVG 重绘自 CSS `.brand-mark`。
- `assets/logo-lingostack.svg` — 印记 + 「译栈 LingoStack」字标。
- `assets/app-icon.svg` — 256 应用/托盘图标（squircle + 斜纹 + elev-ring 呼应）。
- `build/icons.svg` — 应用内图标精灵（导航 + 动作图标，1.7 描边，与原型 viewBox 24 一致）。

No local font files ship — the source loads Inter + JetBrains Mono from Google
Fonts via `<link>`. That link is documented in `DESIGN.md` §3 and reproduced in
every preview / kit page rather than vendoring font binaries.

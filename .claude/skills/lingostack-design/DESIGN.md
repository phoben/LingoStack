# 译栈 LingoStack · Design System

> Category: Project Design System · Surface: desktop web / Tauri 2 app
> Distilled from five source prototypes in this workspace.

译栈（LingoStack）是面向**非英语母语开发者**的桌面翻译工作站——划词即译、变量命名、文档对照、术语解释四条链路集中在一个常驻窗口里。它构建在 Tauri 2 / Rust 之上（安装包约 10MB，内存 < 150MB），核心承诺是**遵循开发行业语言、零遥测、MIT 开源**。

这套设计系统抽取自工作区里五个已复制的原型文件，是所有译栈界面的唯一视觉契约。

## Product Context

译栈面向的核心用户是**非英语母语的开发者**：日常阅读英文技术文档、源码注释、错误信息，并需要把中文需求落到变量名与代码里。产品用 Tauri 2 / Rust 构建，常驻系统托盘，划词即译、命名即取、文档对照、术语解释四条链路覆盖一条完整的「读懂英文 → 写出代码」翻译链路。核心能力包括：源语言自动识别、译文逐字流式渲染、保留产品名 / 变量名 / 命令名（「开发行业语言」）、多 LLM 提供商并存（DeepSeek / Anthropic / Gemini / Ollama，仅用用户自己的 API Key）、热键冲突检测、收藏与 JSON 导入导出。设计上要传达的情绪是「安静、精密、可信」——一台常驻后台、随时唤起的精密仪器，强调零遥测与 MIT 开源带来的信任感。

## 1. Visual Theme & Atmosphere

**深色、克制、专业、面向开发者。** 整体观感接近本地化的命令面板（command palette）与系统级常驻工具：近黑画布上的紧凑卡片、macOS 风格红绿灯标题栏、单色珊瑚品牌色与天蓝色操作信号。

- **视觉风格：** 现代、极简、技术化；信息密度高但不拥挤。
- **色彩立场：** 三层中性深色表面（`#07080a → #101111 → #161719`），单一珊瑚强调色（`#FF6363`），天蓝色作为运营信号（流式渲染、保留术语、焦点环）。
- **情绪关键词：** 安静、可靠、精密——像一台常驻后台、随时唤起的精密仪器，而非喧闹的消费应用。
- **设计意图：** 让译文、术语、代码这三类内容成为视觉焦点；装饰退到最远，每一个像素都为「快速读懂」服务。

## 2. Color

调色板直接读取自原型的 `:root`，未经臆造。三层深色表面 + 单一珊瑚强调 + 一组状态色。

| 角色 | Token | 值 | 用途 |
| --- | --- | --- | --- |
| 画布 | `--bg` | `#07080a` | 最底层背景、输入框、内嵌面板 |
| 表面 | `--surface` | `#101111` | 卡片、工具栏、弹窗、浮窗 |
| 抬升表面 | `--surface-warm` | `#161719` | 次级抬升（原型 `--surface-2`） |
| 主文字 | `--fg` | `#f9f9f9` | 标题、译文、关键数值 |
| 正文 | `--fg-2` | `#cecece` | 正文、次级标签 |
| 弱化 | `--muted` | `#9c9c9d` | 标签、说明、导航 idle |
| 元信息 | `--meta` | `#6a6b6c` | 音标、统计、chrome 微文案（mono） |
| 边框 | `--border` | `rgba(255,255,255,.06)` | 卡片 / 分隔线 |
| 软边框 | `--border-soft` | `rgba(255,255,255,.04)` | 弱分隔 |

**强调色（珊瑚，每屏最多两处）：**

| Token | 值 | 用途 |
| --- | --- | --- |
| `--accent` | `#FF6363` | 品牌印记、eyebrow 小标、冲突 / 危险态 |
| `--accent-on` | `#ffffff` | 强调色之上的文字 |
| `--accent-hover` | `#ff7777` | hover 偏移 |
| `--accent-active` | `#e85757` | active 偏移 |

**操作信号 + 语义状态：**

| Token | 值 | 用途 |
| --- | --- | --- |
| `--info` | `hsl(202,100%,67%)` | **天蓝**：流式光标、保留术语（keep）、live 圆点、焦点环、链接——产品最高频的色相 |
| `--success` | `hsl(151,59%,59%)` | 已连接、就绪、流式完成 |
| `--warn` | `hsl(43,100%,60%)` | 本地提供商、谨慎提示 |
| `--danger` | `hsl(0,100%,69%)` | 预留升级（与 accent 同色系） |

**派生色规则：** 半透明叠层一律用 `rgba(255,255,255, n)`（hover .04–.09）或 `hsla(202,100%,67%, n)`（信号 .1–.35），不引入新 hex。状态药丸用 `color-mix(in oklch, <token> 12–14%, transparent)`。

## 3. Typography

**单一字族驱动 + 等宽搭档。** 译栈是数据密集的开发者工具，按「实用 / 数据密集场景允许单字族」的准则，Display 与 Body 共用 **Inter**；所有代码、变量名、技术术语、音标、状态微文案走等宽 **JetBrains Mono**。这是从原型直接观察到的决定，保持不变。

| 角色 | 字体栈 | 说明 |
| --- | --- | --- |
| Display | `"Inter", "Inter Fallback", system-ui, sans-serif` | 标题、词头、品牌名 |
| Body | `"Inter", "Inter Fallback", system-ui, sans-serif` | 正文、译文、说明 |
| Mono | `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace` | 变量名、术语、音标、kbd、状态、meta |

通过 Google Fonts 加载：`Inter:wght@400;500;600;700` 与 `JetBrains Mono:wght@400;500`。开启 `font-feature-settings:"calt","kern","liga","ss03"`。

**字号阶梯（A1 结构）：**

| Token | 值 | 典型用途 |
| --- | --- | --- |
| `--text-xs` | 12px | meta、eyebrow、kbd、药丸 |
| `--text-sm` | 14px | 正文 / 按钮 / 输入 |
| `--text-base` | 16px | 列表、说明 |
| `--text-lg` | 18px | 引导段 |
| `--text-xl` | 20px | 卡片小标题 |
| `--text-2xl` | 24px | 面板标题 |
| `--text-3xl` | 40px | 页面 H1 |
| `--text-4xl` | 60px | 首屏巨型标题 |

行高 `--leading-body: 1.6`、`--leading-tight: 1.06`；标题 `letter-spacing:-.015em`、`text-wrap:balance`，正文 `text-wrap:pretty`。

## 4. Spacing

4px 基线网格，节奏稳定。`--space-1…--space-12 = 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48`。组件内边距常用 12–16，卡片间距 12–16，段落 13–16，区块纵向 `--section-y` 桌面 96 / 平板 68 / 手机 48。容器 `--container-max: 1120px`，槽口桌面 32 / 平板 24 / 手机 16。

## 5. Layout & Composition

**应用骨架（主窗口原型）：** macOS 红绿灯标题栏 → 左侧固定 188px 图标侧栏（active 项左侧 2px 发丝指示条）→ 右侧多标签面板 → 底部 mono 状态栏。窗口本体 `aspect-ratio:8/6`、圆角 14px、`--elev-ring` 双环阴影。≤760px 时侧栏降级为顶部可横向滚动图标条。

**浮窗 / 弹窗：** 居中浮层、`--elev-ring` + 大投影、入场 `translateY+scale` 动画（.38–.4s）。划词工具栏是贴选区上方的 PopClip 式五键动作条，带三角指示尾。

**栅格：** 卡片网格 `.grid-2/3/4`、`1fr 1fr` 双栏（翻译原文/译文、文档原文/译文）。信息层级永远走 标题 → 支持文案 → 主操作；靠留白分隔先于边框与阴影。

## 6. Components

- **按钮：** 主按钮 = 近白底（`hsla(0,0%,100%,.9)`）+ 黑字、`radius-pill`、`font-weight:600`；次按钮 = 透明 + `rgba(255,255,255,.12)` 边框；ghost = 纯文字。图标按钮 30–40px 方形、`radius 6–10`。**每屏仅一个主操作。**
- **卡片 / 表面：** `--surface` + `--border` + `--elev-ring`，`--radius-lg`。hover 边框提到 `.14–.16`，必要时 `translateY(-2px)`。
- **输入：** `--bg` 底 + `rgba(255,255,255,.08)` 边框；focus 隐藏 outline，改用 `--focus-ring` + 1px 天蓝环。
- **药丸 / 标签：** `radius-pill`、mono、状态色用 `color-mix` 12–14% 底。kbd 键帽带渐变 + 三层阴影。
- **导航：** 侧栏 `.nav-item`（active 左发丝条 + .07 底）、子标签 `.subtab`（凹槽式 `.03` 底容器）。
- **状态栏：** 底栏 mono 10px、就绪绿点 + 模型名 + 内存/CPU。
- **流式译文：** 逐字 `setInterval` 渲染 + 1px 天蓝闪烁光标；保留术语用 `.keep`（mono + 天蓝 + .1 底）。
- **Toast：** 底部居中药丸，绿点 + 文案，1.5–1.6s 自动消失。
- **品牌印记：** 24–26px 方块、`repeating-linear-gradient(115deg, … var(--accent) …)` 斜纹，是译栈唯一的视觉花式。

## 7. Motion & Interaction

两档时长 + 一条缓动：`--motion-fast:150ms`、`--motion-base:220ms`、`--ease-standard:cubic-bezier(.2,0,0,1)`。hover / focus / 颜色切换走 fast；浮层入场、toast、流式走 base。入场动画：面板 `fade`、浮窗 `translateY+scale`、动作条 `popIn`、光标 `blink`、live 圆点 `pulse`。

**状态对比铁律：** hover 永远把背景往亮处移（`rgba(255,255,255,.04–.09)`）或提亮边框，**绝不把文字改成更接近背景的灰**。focus 必须有清晰 `:focus-visible` 环（天蓝 .35 box-shadow 或 2px outline + offset）。disabled 是唯一允许降低对比的状态。尊重 `prefers-reduced-motion`（流式 / 动画应可降级）。

## 8. Voice & Brand

**克制、专业、可信。** 文案面向开发者，动作导向、无填充词。中文界面为主、中英混排时英文术语原样保留（不翻译产品名 / 变量名 / 命令名 / 技术名词——这是产品的核心翻译哲学，称为「开发行业语言」）。

- 标签用动词或名词短语，简短；状态用「已连接 / 本地 / 就绪」。
- 热键文案用符号（⌘ ⇧ ⌃ ⌥）+ 大写字母，mono 呈现。
- 数字 / 版本 / 模型名一律 mono（`deepseek-chat`、`v1.0.0`、`84MB`）。
- 品牌名「译栈 LingoStack」并用；slogan「程序员的桌面翻译栈」；隐私承诺「零遥测」反复出现。

## 9. Anti-patterns

- **不要**引入调色板之外的颜色——没有第二强调色；除 `--info` 信号外不新增色相。
- **不要**用紫色渐变铺底、给每层背景都上渐变，或用 emoji 当功能图标。
- **不要**让 hover 把文字变灰 / 变浅；不要浅字压浅底、深字压深底。
- **不要**在同一视口为同一动作放两个主按钮；导航 / hero / 卡片里的次入口必须是次级 / ghost / 文字链接。
- **不要**用 `Inter / Roboto / Arial / Fraunces` 当 display 字体做花式标题（Inter 在本系统是 utilitarian 正文 / 标题共用，不充当装饰）。
- **不要**翻译应保留的技术术语；不要伪造指标或填充文案。
- **不要**默认暖米 / 奶油底——译栈是冷调近黑主题。
- **不要**在产品工件里放进仅给设计者用的控制面板。

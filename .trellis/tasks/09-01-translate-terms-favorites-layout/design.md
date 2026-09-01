# 技术设计：翻译术语与收藏长文本布局

## 1. 设计目标

在不改变术语 envelope、收藏 JSON 格式和 IndexedDB schema 的前提下，修正术语解释语言、浮层边界和收藏交互，并让长段落收藏在最小桌面窗口中保持可扫描、可展开、无横向撑宽。

本设计遵循当前生产 UI 的单层主面板和分割线行结构。`.claude/skills/lingostack-design/` 只用于补充 overlay 与图标意图，不恢复旧原型中的嵌套卡片或固定窗口布局。

## 2. 已确认根因

| 问题                        | 根因                                                                                                                   | 证据                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 术语解释跟随原文语言        | 受保护协议把 `source` 直接写进 `explanation` 约束                                                                      | `crates/lingostack-core/src/prompt.rs:38-45`                           |
| Tooltip 影响译文滚动/被裁剪 | `absolute` Tooltip 仍位于 `overflow-auto` 译文滚动区与 `overflow-hidden` section 内；提高 z-index 无法越过祖先裁剪边界 | `src/components/views/translate-view.tsx:26-76,352-385`                |
| 术语标签无收藏态            | `TermTags` 没有连接收藏 store；现有收藏只按随机 `id` 新增/删除                                                         | `translate-view.tsx:26-76`、`favorites.ts:13-45`、`favorites-store.ts` |
| 长段落撑坏收藏列            | 单行 flex 使用内容本征宽度，文本项缺少 `min-w-0`、有界轨道和任意位置换行                                               | `favorites-view.tsx:185-237` 与用户截图                                |

完整研究见 `research/ui-term-favorites-findings.md`。

## 3. 边界与职责

### 3.1 Rust core：只负责受保护术语协议

`compose_translation_prompt` 的语言参数改为明确的 `explanation_language`。它只决定 JSON 中 `explanation` 的语言，不参与源/目标语言规划，也不改变 sentinel 或字段结构。

内置与用户自定义翻译 Prompt 最终都要经过该函数，因此界面语言约束继续属于不可覆盖协议。

### 3.2 Tauri IPC：显式传递实际界面语言

`effective_translation_prompt` 增加 `explanation_language: Language` 参数；`src/lib/ipc.ts` 同步增加 `explanationLanguage`。前端用现有 `resolveLocale(uiLanguage)` 把 `system` 解析成 `zh` 或 `en` 后传入。

Rust 不自行推断系统界面语言，因为浏览器 locale 只存在于 renderer。`translationPlan` 的源/目标语言规则保持不变。

### 3.3 收藏纯逻辑、IndexedDB 和 Zustand

- `src/lib/favorites.ts` 新增内容规范化与匹配 helper。规范化只用于身份比较：trim、连续空白折叠、大小写归一；展示与导出仍保留原内容。
- 术语标签的收藏身份由规范化后的 `term` 决定；模型在不同翻译中给出不同 `meaning` 时仍指向同一已收藏术语。
- 匹配只影响状态识别和取消范围，不静默改写已保存记录的 `meaning`；用户点击取消时删除同一规范化术语的全部历史重复项。
- `src/lib/favorites-db.ts` 只新增“按 id 数组在同一个 readwrite transaction 中批量删除”的薄 IO 原语，不承载业务匹配规则，不升级 `DB_VERSION`。
- `favorites-store` 新增 `loaded` 与 `toggle(term, meaning, source)`：
  - 未命中时乐观新增一条；失败恢复原列表。
  - 命中时乐观移除全部同一规范化术语条目，并用一个事务删除全部 id；失败恢复原列表。
  - 成功后保持按时间倒序。
- 不在 `load()` 或导入时静默去重。历史重复数据只在用户明确取消该内容收藏时被一并移除。

### 3.4 React 术语组件

把 `TermTags` 从 `translate-view.tsx` 提取为业务组件 `src/components/term-tags.tsx`，不创建全局通用 Tooltip 原语。

每个术语渲染为一个组合标签：可聚焦的术语文本 + 独立 Bookmark 按钮。Bookmark 使用 `aria-pressed`、本地化可访问名称和空心/实心视觉；同一术语操作进行中时禁用该按钮，避免快速重复点击造成竞争。

`TranslateView` 首次挂载时在尚未加载的情况下调用收藏 store 的 `load()`。加载完成前不把未知状态伪装成“未收藏”；收藏按钮保持不可用。加载失败沿用现有错误 Toast，并允许下次进入页面重试。

### 3.5 顶层 Tooltip

打开的 Tooltip 通过 `createPortal` 挂到 `document.body`，使用 `position: fixed`，从译文 scrollport 的布局与裁剪树中脱离。

定位规则：

1. 优先放在标签下方，间距 6–8px。
2. 下方空间不足时翻到上方。
3. 左右保留 8px viewport gutter；宽度不超过 `calc(100vw - 16px)`。
4. 打开后在窗口 resize、捕获阶段 scroll 时重新测量；触发器卸载时关闭。
5. Tooltip 保持信息性、`pointer-events: none`，不把收藏操作放进浮层。

交互继续支持 hover、键盘 focus、blur、pointer leave 与 Escape，并保留 `role="tooltip"` / `aria-describedby`。

## 4. 收藏行布局

收藏行继续使用 `divide-y` 和轻量 hover。内部改为两层有界 grid：

```text
row: [ content minmax(0,1fr) ][ actions auto ]
content: [ term minmax(0,2fr) ][ meaning minmax(0,3fr) ]
footer: metadata + expand/collapse
```

原文与释义都使用 `min-w-0`、`whitespace-pre-wrap`、`break-words` 和 `overflow-wrap:anywhere`，连续路径、URL、命令名与无空格字符都必须在自己的轨道内换行。

默认状态应用 `line-clamp-3`。视图局部的 overflow 测量逻辑比较 `scrollHeight` 与 `clientHeight`，并用 `ResizeObserver` 在窗口或可调侧栏改变可用宽度时重新判断；环境不提供该 API 时至少在 mount 和 window resize 时重测。仅真实溢出时显示一枚本地化的展开按钮。

展开以收藏 `id` 为界，只存在于当前 React 会话；展开后同一行原文与释义都显示全文，按钮变为收起并带 `aria-expanded=true`。过滤导致条目卸载时无需持久化展开状态。

## 5. 数据流

### 5.1 翻译请求

```text
config.ui_language
  -> resolveLocale(system | zh | en)
  -> effectiveTranslationPrompt(source, target, explanationLanguage)
  -> Tauri command
  -> compose_translation_prompt(base, explanation_language)
  -> protected term JSON instruction
```

### 5.2 术语收藏切换

```text
TermTags(term, explanation)
  -> favorite identity helper
  -> favorites-store.list determines aria-pressed/icon
  -> toggle()
      -> add one record, or remove all same-term ids atomically
      -> optimistic UI
      -> IndexedDB success keeps state / failure restores exact previous list
```

## 6. 兼容性与迁移

- sentinel、JSON 字段、`TranslationTerm` 类型不变，现有 provider 与 parser 无迁移。
- IPC 只增加命令参数；Rust 与 TS wrapper 必须同批修改，并用真实 Tauri E2E 验证往返。
- IndexedDB 仍为 version 1；已有收藏与导入导出 JSON 均不改写。
- 不新增 npm/Rust 依赖，不引入第二套图标、颜色或组件库。

## 7. 失败与回滚

- Prompt/IPC 回滚：恢复第三个参数及 core 函数签名，不涉及持久数据。
- 收藏新增/取消失败：store 恢复操作前完整列表，Toast 展示错误。
- 批量删除事务 abort/error：不得发生部分删除。
- Tooltip 测量失败：不把不可靠坐标写入页面；关闭浮层优于让其遮挡或撑开内容。
- ResizeObserver 不可用：降级为 mount + window resize 测量，全文仍可通过展开状态访问。

## 8. 验证边界

Vitest/RTL 能证明 pure helper、store 回滚、ARIA 状态、Portal DOM 归属和模拟矩形下的 flip/clamp；不能证明 WebView 的真实裁剪、字体行高或 compositor stacking。

Windows Tauri 实窗必须独立验证：中文/English 界面语言、滚动后 Tooltip、四边界定位、最小 `864×576`、长段落/URL 的三行折叠与展开，以及术语收藏新增—重开页面—取消。自动化、真实桌面和人工视觉证据分别报告。

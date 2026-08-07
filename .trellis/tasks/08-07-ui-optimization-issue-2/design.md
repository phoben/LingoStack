# Design · 翻译与命名体验优化（issue #2）

## 1. 架构决策

### 1.1 任务态上移：视图组件 → Zustand store（R7 核心）

**问题**：`src/App.tsx:60` 条件渲染六视图，切页面即卸载视图，其 `useState`
（`source` / `target` / `status` / `raw`）随之销毁。后端 `chat_stream`
（`src-tauri/src/commands.rs:76`）作为独立 async task 继续推 Channel 事件，
但闭包捕获的 `setTarget` 指向已卸载组件——React 18 静默丢弃更新。

**两个候选**：

| 方案 | 做法 | 取舍 |
|------|------|------|
| A. `display:none` 保活 | 六视图全部挂载，非激活者 CSS 隐藏 | 改动小；但六视图（含 IndexedDB 收藏、settings 表单）常驻内存与副作用，`animate-panel-in` 入场动画失效，`aria-live` 在隐藏区仍播报 |
| **B. 任务态上移 store（采纳）** | 流式任务的原文/输出/状态/错误移入 zustand，视图变为纯展示 | 视图仍可自由卸载；状态天然跨页面存活；可测（store 层单测无需渲染）；与既有 `injectSource` 跨组件通信一致 |

采纳 B。理由：`favorites-store` / `config-store` 已确立「跨视图状态进 store」
的既有约定，B 是延续而非新增模式；且 store 层可脱离 DOM 单测，满足 AC9。

### 1.2 新增 `stores/stream-store.ts`

单一 store 管理两条流式任务通道，按 `Feature` 键区分（当前 `translate` / `naming`；
后续 `explain` / `doc_translate` 复用同一形状，无需扩形）。

```
StreamTask {
  status: "idle" | "streaming" | "done" | "error"
  output: string        // 累积的 LLM 原始输出
  error: string | null
  input: string         // 本次任务的输入（原文 / 描述）
  seq: number           // 任务序号，用于丢弃过期回调
}
```

关键行为：
- `start(feature, input, buildMessages)`：递增 `seq`，置 `streaming` 并清空 `output`，
  发起 `chatStream`。回调内先比对 `seq`，不等则丢弃——避免用户连点两次生成时
  旧流的增量污染新结果。
- 回调只写 store，不碰组件。视图挂载时从 store 读当前值即可复现完整状态。
- 输入框内容也进 store（`input`）：否则切回页面后原文框空白但译文有内容，自相矛盾。

**并发**：两个功能可同时在跑（翻译中切到命名页发起生成），互不干扰——
store 内是两条独立记录，后端每次 invoke 一个独立 task。

**不做取消**：Tauri 2 Channel 无内建 abort；`seq` 守卫已保证 UI 正确性，
后端多跑一次的代价可接受（Out of Scope 已声明）。

### 1.3 命名：候选词 + 本地写法转换（R1 决策落地）

一次请求取回 5 个**中性候选词**（空格分隔的英文词组，如 `get user profile`），
前端本地转成五种写法，保证五列逐行对齐。

- 新增 `src/lib/case-convert.ts`：`toStyle(words: string, style: NamingStyle): string`。
  输入按非字母数字边界 + 驼峰边界切词，再按目标写法拼接。纯函数，重点单测对象。
- `src/lib/naming.ts` 的 `parseCandidates` 保留（行清洗逻辑不变），
  新增 `buildNamingGrid(raw): NamingRow[]`，每行 = 一个候选词的五种写法。
- 内置指令 `crates/lingostack-core/src/prompts/naming.txt` 改为：
  输出 5 行、每行一个**小写空格分隔的英文词组**、不带任何写法修饰。
  同步调整 `prompt.rs:105` 的 `{style}` 占位符断言——占位符不再需要，
  改为断言「要求 5 行」「要求英文词汇」等风格约束，防止回归。

**注意**：`effective_prompt` 仍按 `Feature::Naming` 取指令，签名不变；
前端不再替换 `{style}`。`PromptOverrides.naming` 语义随之改变（现在描述的是
「产出中性候选词」而非「产出某写法」）——设置页无 Prompt 编辑入口（已核查），
无存量用户覆盖受影响。

### 1.4 五列布局（R3）

`grid grid-cols-5 gap-2.5`，每列一张卡片（`rounded-lg border bg-background`，
对齐设计规范的 card 形状）：卡头是写法名（mono，`text-muted-foreground`），
卡内五行 `divide-y divide-border`。每行一个候选 + 复制按钮（`ghost` / `icon`）。

列宽紧张（`CONSTANT_CASE` 的 `GET_USER_PROFILE` 较长）：候选文本用
`break-all` + `text-[13px]`，复制按钮缩到 `h-6 w-6`，标识符不截断（设计规范
禁止 clipped text）。窄窗口下 grid 允许横向滚动而非压缩到不可读。

复制反馈：`copied` 记录 `列+行` 复合键，避免同一个词在不同列都亮起。

## 2. 数据流与契约

```
用户点「生成」
  → NamingView 调 streamStore.start("naming", desc, buildMessages)
  → store: seq++ / status=streaming / output=""
  → ipc.chatStream("naming", messages, cb)
  → Rust chat_stream 独立 task → Channel 推 chunk/done/error
  → cb 校验 seq → store.output += delta
  → NamingView 订阅 output → buildNamingGrid(output) → 五列渲染

切到收藏页：NamingView 卸载；store 与后端 task 均不受影响
切回命名页：NamingView 挂载，从 store 读 input/output/status → 完整复现
```

翻译同构，额外保留 `injectSource` 通路（`app-store`）：热键划词仍写
`injectSource`，`TranslateView` 消费后调 `streamStore.start("translate", ...)`。

后端契约（`ChatEvent` / `chat_stream` / `effective_prompt`）**零改动**。
唯一后端改动是命名指令正文与其断言。

## 3. 兼容性

- 配置文件形状不变（无字段增删），存量配置文件可直读。
- `naming_styles` 配置字段仍未被消费（Out of Scope 保持原状），五列硬编码全五种。
- `parseCandidates` 与其 7 条既有测试保留不动。

## 4. 权衡记录

- **没引入状态栏**：模型信息按 R5 决策整体撤出界面；若将来要显示「当前用什么模型」，
  状态栏是合适载体，此次不做。
- **候选数固定 5**：R3 明确「每列 5 行」。指令要求 5 行；若模型少给，
  网格只渲染实际行数，不填占位——空白格比假候选诚实。若多给，取前 5。
- **`seq` 而非 AbortController**：Channel 无 abort 语义，`seq` 是最小可行守卫。

## 5. 回滚点

三块改动彼此独立，可分别回退：
1. `stream-store` + 两视图接线（R7）
2. 命名指令 + `case-convert` + 五列布局（R1/R2/R3）
3. 翻译页按钮位置 + 去模型名 + 去光标（R4/R5/R6）

第 2 块含 Rust 侧指令改动，是唯一跨越前后端的一块；其余纯前端。

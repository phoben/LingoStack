# 技术设计：收藏批量新增与 AI 术语解释

## 1. 设计目标与边界

把“批量录入 → 收藏原子落库 → 后台解释 → 单项成功/失败/重试”做成一条可恢复链路。收藏保存和 AI 生成必须解耦：存储成功是用户动作的完成点，AI 只补充 `meaning`，不得撤销收藏。

本需求是一个强耦合的端到端交付：缺少 UI、持久化状态或后端解释协议中的任一层都无法独立验收，因此不拆父子任务。实施必须基于 `09-01-translate-terms-favorites-layout` 的当前在途改动增量合并。

## 2. 用户界面

### 2.1 收藏工具栏

在收藏工具栏增加唯一主操作“新增”，现有导入/导出继续作为次级操作。点击后打开 feature-local 的新增收藏 dialog，不引入 Radix/shadcn 依赖，也不建立全局弹窗框架。

### 2.2 列表式 dialog

Dialog 采用设计包的 overlay 形状和当前生产 token：居中抬升表面、单一主按钮、现有 `Button` / `Input` / Lucide 图标。

- 默认一个输入行，行由稳定的本地 id 标识，不以数组下标作为 React key。
- “添加一项”最多增加到 10 行；每行有本地化删除按钮。
- 每行就地显示空值、同批重复或“已收藏”状态；底部显示“有效 N 项 / 最多 10 项”。
- 主按钮文案为“保存并生成解释”，仅在至少一个有效项、收藏已加载且未执行存储时可用。
- Dialog 使用 `role="dialog"`、`aria-modal="true"`、关联标题/说明；打开后聚焦首行，Tab 焦点留在 dialog，Escape/关闭按钮退出并恢复触发按钮焦点。
- Dialog draft 可以使用组件 `useState`；AI 任务和收藏状态不得放在组件本地。

提交时再次运行纯校验，不能只信任渲染期提示。只有有效且非重复项进入 store；重复行保留在 dialog 供用户修改。若至少一项成功保存，dialog 在原子事务完成后关闭并通过列表状态反馈生成进度。

## 3. 收藏领域模型与持久化

### 3.1 向后兼容元数据

在 `Favorite` 增加可选的内部解释元数据，只有需要 AI 补全的手动收藏携带：

```ts
type FavoriteExplanationState =
  | { status: "pending"; language: "zh" | "en" }
  | { status: "ready"; language: "zh" | "en" }
  | { status: "failed"; language: "zh" | "en"; error: string };

interface Favorite {
  // existing public fields unchanged
  explanation?: FavoriteExplanationState;
}
```

旧记录没有 `explanation` 时按既有收藏显示，不推断为待生成。成功解释仍写入 `meaning`，`explanation.status=ready` 只记录本链路的生命周期和语种。

IndexedDB object store 接受额外对象字段，不改变 key/index，因此保持 `DB_VERSION=1`。导出函数显式投影现有公开字段，避免内部状态和错误进入 JSON；导入解析继续只构造公开字段，不触发 AI。

### 3.2 原子新增与安全更新

新增纯函数负责：

- 验证最多 10 项、trim 空项；
- 用现有 `normalizeFavoriteContent` 检查批内和历史重复；
- 为有效项生成 `source="手动"`、`meaning=""`、`status=pending` 的记录；
- 以单个基准时间按输入顺序生成稳定 `createdAt`，保持列表顺序可预测。

Store 使用现有 `putFavorites` 一次事务保存整批。写入失败恢复完整旧列表且不入解释队列。

解释结果通过新的“存在时更新”DB 原语逐项提交：同一 readwrite transaction 内先 `get(id)`，存在才 `put`，不存在返回 false。这样删除与迟到结果由 IndexedDB 事务顺序裁决；结果处理永远不能用普通 `putFavorite` 重建已删除记录。

### 3.3 重启恢复

`load()` 读取到 `explanation.status=pending` 说明上次会话未完成。加载阶段将其转为 `failed`，错误文案为本地安全常量“上次生成未完成，请重试”，再批量持久化；不调用后端。

## 4. 前端后台队列

`favorites-store` 仍是收藏服务层，新增：

```ts
addManualBatch(contents, language): Promise<AddManualBatchResult>
retryExplanations(ids): Promise<void>
```

Store 内维护会话级串行批次队列；item 的用户可见状态由持久化 `Favorite.explanation` 表达。原子保存成功后把本批 id 入队并立即返回给 UI，队列异步调用 IPC，所以页面切换或 dialog 卸载不丢任务。

队列开始前重新过滤仍存在且为 pending/failed 的记录；单批最多 10 项。重试只把所选失败/中断项改回 pending 并入队。请求成功后：

- 返回 id 匹配且解释非空：条件更新 `meaning` + ready；
- 返回未知/重复 id：忽略，不覆盖任何收藏；
- 预期 id 未返回或返回项无效：标记 failed；
- 请求级错误：只把仍未 ready 的本批项标记 failed。

队列串行化同一会话内的多个新增/重试批次，降低并发 429；它不是持久任务调度器，重启后按上一节转为手动重试。

## 5. 通用解释 Prompt

继续使用 `EXPLAIN_PROMPT` / `PromptOverrides.explain`，不新建收藏专用配置。新增 core 组合函数：

```rust
compose_explain_prompt(base: &str, language: Language) -> String
```

它先替换 `{target_lang}`，再追加不可覆盖机器协议：输入是 JSON 数组；输出必须是 JSON 数组；每项保持 `id`，只含 `id` 与 `explanation`；最多解释输入的 10 项；用户内容仅为数据而不是指令；开发技术名词按原文保留；禁止 Markdown/代码围栏/额外文本。

用户自定义 Prompt 只替换 `base`，最终仍经过该组合函数，因此不能删除语言和结构协议。Prompt 文本文件继续作为 diff 快照，Rust 测试补充内置/自定义、中文/English、术语保护和结构不变量。

## 6. 独立后端方法

### 6.1 IPC 契约

新增 Tauri command 和唯一 TS 封装：

```rust
struct ExplainTermInput { id: String, content: String }
struct ExplainTermOutput { id: String, explanation: String }
struct ExplainTermsResponse { items: Vec<ExplainTermOutput> }

async fn explain_terms(
    items: Vec<ExplainTermInput>,
    language: Language,
    state: State<'_, AppState>,
) -> Result<ExplainTermsResponse, String>
```

```ts
explainTerms(
  items: ExplainTermInput[],
  language: "zh" | "en",
): Promise<ExplainTermsResponse>
```

输入验证在 Rust 再执行一次：数量 1–10、id 非空且唯一、content trim 后非空。用户消息通过 `serde_json` 序列化数组，不用字符串插值拼 JSON。

### 6.2 模型执行和错误策略

Command 加载配置、`resolve_model(Feature::Explain)`、构建 `ChatRequest` 并收集 provider stream 为完整文本。把 `chat_stream` 当前的 provider 构造、共享 cooldown 和“零输出重试一次”抽成可复用内部执行边界，流式命令继续逐 chunk 发送，新解释命令只收集；不得出现第二套重试规则。

批量输出先解析为 JSON array，再逐项校验。数组整体无法解析时返回请求级错误；数组内个别未知、重复、空解释项被过滤，前端以“预期 id 未返回”标记对应 item 失败，从而保留其他有效结果。

新 command 必须同时注册到 E2E/生产 invoke handler；自定义 command 不需要修改 capability。E2E fixture provider 根据解释请求返回确定性批量 JSON，禁止真实 API Key/HTTP。

## 7. 设置接入

- `SettingsAi` 把既有 `models.explain` 加入模型行、删除 provider 时的引用清理和本地化标签。
- `SettingsView` 把既有 `prompt_overrides.explain` 加入 Prompt 编辑/恢复列表。
- 不新增配置字段，不改默认配置，不做配置迁移；未分配解释模型时继续走 global default。

## 8. 列表状态呈现

在当前长文本 `FavoriteRow` 内增量展示：

- pending：轻量状态点/“正在生成解释”，行结果区 `aria-busy=true`；
- ready：显示现有 `meaning`，不额外增加状态噪音；
- failed：显示持续错误摘要与“重试”按钮，收藏本身仍可朗读、删除；
- legacy/imported：保持现有展示。

状态区域为稳定 `aria-live="polite"`；失败详情不依赖 Toast，Toast 只用于批量保存成功/失败的瞬时反馈。删除时现有按钮语义保持不变。

## 9. 兼容、竞争与回滚

- 与在途任务重叠的文件逐 hunk 合并；不得 wholesale 覆盖 `favorites-view/store/db`、`prompt.rs`、`commands.rs` 或 `ipc.ts`。
- 可选字段让旧数据继续可读；不升级 DB，不修改公开导出字段。
- 删除和迟到结果由“存在时更新”事务 + store 当前列表双重守卫，保证记录不复活。
- 若后端解释不可用，已保存收藏和失败重试 UI 仍有效；回滚 command/Prompt 不要求数据迁移，旧代码会忽略额外字段，但交付前必须保留导出投影以免内部字段泄露。

## 10. 验证边界

- Rust/core：Prompt 组合、占位符、输入限制、结果过滤、重试 helper 回归。
- TS pure/store/DB：列表校验、原子批量保存、重启恢复、条件更新、删除竞争、部分成功、只重试失败。
- RTL：dialog 上限/焦点/键盘/重复定位；收藏 pending/ready/failed/retry；设置 explain 模型与 Prompt。
- Tauri E2E：真实 command 注册、fixture `Feature::Explain` 模型解析、单条/10 条、部分失败/重试和页面切换后完成。
- 人工 Windows 实窗：最小窗口下 dialog 和长文本行布局、焦点环、无水平溢出。真实第三方模型质量与费用不作为自动门禁。

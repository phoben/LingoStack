# 收藏批量新增与术语解释：代码库调研

## 调研方式

- 仓库存在 `.codegraph/`，先用 `codegraph explore/node` 定位收藏、Prompt、语言、IPC 和调用路径，再读取非索引 Prompt 文本、Trellis 规范及精确 diff。
- 调研基线为当前 `develop` 工作树；其中包含其他任务的未提交改动，不能把 `HEAD` 当成真实实现基线。

## 已有能力

### 收藏

- `src/lib/favorites.ts`：`Favorite` 仍是扁平对象；`normalizeFavoriteContent` / `matchesFavoriteTerm` 已由在途任务加入，身份规则是 trim、连续空白折叠和大小写归一。
- `src/lib/favorites-db.ts`：DB `lingostack`、版本 1、object store `favorites`；`putFavorites` 已提供单事务批量写入，适合批量新增的原子保存。
- `src/stores/favorites-store.ts`：新增/删除失败会恢复操作前列表；当前没有批量手动新增、解释状态或解释结果更新动作。
- `src/components/views/favorites-view.tsx`：在途任务已把长文本行改为有界 grid、三行折叠与展开；新状态必须增量嵌入该结构，不能恢复旧 flex 行。

### Prompt、模型与语言

- `crates/lingostack-core/src/prompt.rs` 已有 `EXPLAIN_PROMPT` 和 `PromptOverrides.explain()`；`src/prompts/explain.txt` 当前面向单个术语，只有 `{target_lang}` 占位符，没有结构化批量协议。
- `crates/lingostack-core/src/config.rs` 已有 `Feature::Explain` 和 `ModelAssignment.explain`，解析顺序会自然复用“功能模型 → 全局默认”。不需要新增配置字段或迁移。
- `src/components/settings-ai.tsx` 的功能模型列表当前遗漏 `explain`；`settings-view.tsx` 的 Prompt 列表也遗漏 `explain`。两处都需显式接入既有字段。
- `UiLanguage::System` 在 Rust 无法知道浏览器 locale；当前翻译链路使用前端 `resolveLocale(uiLanguage)` 后显式传语言，解释链路应复用同一方式。

### IPC 与重试

- 所有业务 invoke 必须经 `src/lib/ipc.ts`；新增命令还要同时注册进 `src-tauri/src/lib.rs` 的 E2E/生产两个 handler。
- `src-tauri/src/commands.rs::chat_stream` 已实现：按 Feature 解析模型、共享 429 cooldown、只在零输出时重试一次、四协议共用 `LlmProvider`。
- 新解释方法需要收集完整批量 JSON，不能把通用流式原文直接交给收藏视图；应复用相同 provider/retry/cooldown 边界，避免出现两套错误策略。

## 设计系统与可访问性

- `lingostack-design` 的 overlay 原型提供居中浮层、单一主操作、输入 focus ring 和 540px 左右 modal 形状；收藏原型本身没有新增入口，因此生产收藏行与当前 UI 规范优先。
- 项目没有 Radix/shadcn 生成依赖，`src/components/ui/` 是手写原语。新增弹窗应采用现有 token/Lucide/Button/Input，不运行 shadcn CLI、不引入第二套组件库。
- 新异步区域必须使用稳定 `aria-live="polite"` / `aria-busy`；持续失败就地展示 `role="alert"` 或等价可观察状态，避免 Toast 成为唯一证据。

## 在途改动边界

- `09-01-translate-terms-favorites-layout` 当前修改 `prompt.rs`、`commands.rs`、`ipc.ts`、`favorites.ts`、`favorites-db.ts`、`favorites-store.ts`、`favorites-view.tsx` 等同一批热点文件。
- 实施前必须重新检查 `git status` / `git diff`，把这些改动视为用户工作；逐处增量合并，不覆盖、不 checkout、不复原。
- 该任务已把翻译术语解释语言改为界面语言，但本任务的批量解释是独立方法和独立 JSON 协议，不能复用翻译 sentinel envelope。

## 验证边界

- Vitest/fake-indexeddb：纯校验、批量原子性、旧记录兼容、迟到结果、重启恢复、dialog/列表状态。
- Rust：Prompt 协议、后端输入校验、JSON 结果映射、零输出重试和共享 cooldown 复用。
- 真实 Tauri E2E：新 command 注册、Feature::Explain 模型解析、fixture provider、IndexedDB 保存后异步更新与重试。
- 自动化不能证明真实第三方模型质量；不使用真实 API Key 做门禁。

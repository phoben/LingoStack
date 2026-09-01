# 实施计划：收藏批量新增与 AI 术语解释

## 前置条件

- [ ] 重新运行 `git status --short` 和相关路径 `git diff`，确认 `09-01-translate-terms-favorites-layout` 的最新在途改动；将其作为基线逐 hunk 增量实现，不复原用户改动。
- [ ] 读取 `implement.jsonl` 注入的 frontend/backend/core/IPC/测试规范与本任务调研。
- [ ] 核对当前任务仍为 `planning`，只有用户批准最终规划后才运行 `task.py start` 并进入实现。

## 1. 收藏纯逻辑与持久化

- [ ] 在 `src/lib/favorites.ts` 增加可选解释状态类型、最多 10 项常量、批量校验/规范化/建模纯函数；保留现有匹配及长文本改动。
- [ ] 让 `toExportJson` 显式投影既有公开字段，`parseImport` 继续忽略内部解释元数据；补历史 JSON 与新记录往返兼容测试。
- [ ] 在 `src/lib/favorites-db.ts` 增加“记录存在时更新”的 readwrite 事务原语；不得升级 `DB_VERSION`，不得让迟到结果通过普通 put 复活已删记录。
- [ ] 扩展 fake-indexeddb 测试：10 条原子新增、中途失败全回滚、条件更新存在/已删除、内部元数据不导出。

## 2. 通用解释 Prompt 与 Rust 业务边界

- [ ] 扩展 `crates/lingostack-core/src/prompts/explain.txt`，保持面向程序员和开发术语保护。
- [ ] 在 `prompt.rs` 增加 `compose_explain_prompt(base, language)`：替换界面语言并追加不可覆盖的批量 JSON 协议；把 Explain 加入结构/不变量测试。
- [ ] 测试内置/自定义 Prompt、中文/English、1 项/10 项协议、禁止 Markdown/额外输出和技术名词保留。
- [ ] 在 `src-tauri/src/commands.rs` 定义解释请求/响应 serde 类型、1–10 条输入校验、严格 JSON array 解析和逐项有效结果过滤。
- [ ] 抽取并复用 provider stream 执行边界，使现有 `chat_stream` 与新 `explain_terms` 共享 Feature 模型解析、429 cooldown 和零输出一次重试；现有流式行为与事件形状不得改变。
- [ ] 注册 `explain_terms` 到 `src-tauri/src/lib.rs` 的生产与 E2E handler，并为 E2E fixture provider 增加确定性解释响应；不修改生产 capability。

## 3. TypeScript IPC 与收藏后台队列

- [ ] 在 `src/lib/ipc.ts` 增加请求/响应类型和唯一 `explainTerms` 封装；参数使用 Tauri camelCase 契约，组件/store 不直接 `invoke`。
- [ ] 扩展 `favorites-store`：原子 `addManualBatch`、串行解释队列、部分成功映射、请求错误、重启 pending→failed、只重试失败项。
- [ ] 保存时用 `resolveLocale(config.ui_language)` 冻结 `zh/en`；切换界面语言不得改变队列中批次。
- [ ] 结果持久化前检查当前 item/id；调用 DB 条件更新，删除后迟到结果只忽略，不重建。
- [ ] Store 测试覆盖：保存成功后立即返回、DB 失败不调用 AI、单条/10 条、部分成功、未知/重复/缺失响应、请求错误、串行批次、语言冻结、重启不自动请求、删除竞争与只重试失败。

## 4. 列表式新增 UI 与收藏状态

- [ ] 新增 feature-local `AddFavoritesDialog`（位于既有 `src/components/`，不引入新 UI 框架）：稳定行 key、默认一项、添加/删除、最多 10 项、有效数量和就地错误。
- [ ] 实现 dialog 语义、首焦点、焦点圈定、Escape、关闭后焦点恢复和 reduced-motion 兼容；输入 draft 可留在组件状态。
- [ ] 在当前 `FavoritesView` 工具栏加入唯一主操作“新增”；保留搜索、筛选、导入导出及在途长文本布局。
- [ ] 在 `FavoriteRow` 增量展示 pending/failed/retry，ready 和 legacy 保持既有 meaning；使用稳定 `aria-live` / `aria-busy`，错误与重试持续可见。
- [ ] `src/lib/i18n.ts` 同步添加中英文 dialog、数量、上限、重复、生成、失败、中断、重试及设置标签，保证字典键完全一致。
- [ ] 组件测试覆盖键盘、焦点恢复、10 项上限、重复定位、原子保存错误、页面切走后 store 完成、状态和重试可访问性。

## 5. 设置接入

- [ ] `SettingsAi` 把既有 `models.explain` 加入功能模型行、清空与 provider 删除引用清理，标签为“术语解释” / “Term explanation”。
- [ ] `SettingsView` 把既有 `prompt_overrides.explain` 加入 Prompt 编辑和恢复内置操作。
- [ ] 更新 RTL：选择/清空解释模型、global default 回退文案、编辑/恢复解释 Prompt、中英标签唯一且可访问。

## 6. E2E 与集成验收

- [ ] 扩展 feature-gated fixture，使解释命令可返回单条、10 条、部分缺失和确定性错误；不得访问真实 HTTP/API Key。
- [ ] 扩展真实 Tauri E2E：收藏页新增 2 项→立即看到 pending→fixture 解释落库；页面切换期间完成；失败项单独重试；设置解释模型持久化。
- [ ] 验证新 command 仅是生产业务命令，不把 WDIO fixture 控制面暴露到默认构建；运行生产隔离。
- [ ] Windows 实窗人工检查 `864×576` 与默认窗口：dialog 无裁剪/水平溢出、10 行可滚动、焦点环可见、长文本收藏状态不挤出操作按钮。

## 7. 规范与收尾

- [ ] 用 `trellis-update-spec` 更新可执行契约：Prompt 批量协议、解释 IPC、收藏持久状态/条件更新、设置 Explain 行与测试矩阵；只记录可复用规则。
- [ ] 若实际新增目录或高层仓库结构发生变化，同步 `CLAUDE.md` 布局；仅在既有目录新增文件时不扩写无关结构。
- [ ] 复核 PRD 的 AC1–AC13，每条记录 automatic / desktop / manual 的证据边界。
- [ ] 不自动 commit/push/archive；如用户随后授权提交，精确暂存本任务文件并保留其他任务未提交变更。

## 验证命令

快速反馈：

```bash
cargo test -p lingostack-core
cargo test -p lingostack-app
pnpm exec vitest run src/lib/favorites.test.ts src/lib/favorites-db.test.ts src/stores/favorites-store.test.ts
pnpm lint
pnpm build
```

最终门禁：

```bash
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo test -p lingostack-app --features e2e
pnpm test
pnpm test:production-isolation
pnpm test:e2e
git diff --check
```

## 风险与回滚点

- **热点文件冲突**：`favorites-*`、`prompt.rs`、`commands.rs`、`ipc.ts` 已有其他任务改动；每阶段先看 diff，禁止整文件替换。
- **删除/迟到竞争**：若条件更新测试失败，停止 UI 接入，先修 DB 事务；不能用“store 里看不到就算安全”替代持久层保证。
- **Prompt/解析不稳定**：结构协议和解析器作为一组回滚；不得保留已启用 UI 却返回不可映射的自由文本。
- **IPC 注册遗漏**：Rust/TS 编译通过不证明 command 可调用；真实 E2E 未过前不得宣布完成。
- **内部字段泄露**：导出兼容测试失败即停止交付；不能以“额外 JSON 字段向后兼容”为由改变公开导出格式。

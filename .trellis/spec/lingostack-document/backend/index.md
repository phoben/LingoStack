# lingostack-document 开发规范

路径：`crates/lingostack-document`。

该 crate 是文档翻译的 deep module：SQLite 中只保存内容哈希、显示文件名、内部 Markdown 执行片段、译文、世代与文档级术语；绝不保存源文件二进制或绝对路径。Tauri 只负责 provider、原生对话框和进度事件，React 只读取可刷新的快照和一篇连续 Markdown。

- 同一内容哈希返回既有记录，不创建副本；导入错误不会发起模型请求。
- 文本型 PDF、DOCX 与 Markdown 都转换为规范化 Markdown；需要 OCR 的输入必须返回精确文本“暂不支持”。
- 已完成文档重新翻译写入 working generation；一次整篇 Markdown 请求成功后才原子提升为 active generation。失败、暂停或取消不得覆盖旧译文。
- 解析块仅用于规范化源 Markdown；它们不是模型请求、响应、进度或 reader 协议。整篇结果为空或失败时不得写入展示数据。
- reader 只提供 source/translation 两种连续 Markdown；未完成、暂停、失败或取消的译文返回空正文和文档级状态，绝不插入原文、`[未翻译]` 或分块占位标记。

验证：

```powershell
cargo test -p lingostack-document
cargo clippy -p lingostack-document --all-targets -- -D warnings
```

## Scenario: 连续 Markdown reader

### 1. Scope / Trigger

- 修改解析存储、Markdown 合成、reader IPC 或文档 UI 时，内部执行片段不得重新泄漏为前端逐块 interface。

### 2. Signatures

- Rust：`document_content(document_id, DocumentView::{Source, Translation}) -> DocumentContent`。
- Tauri/TS：`documentContent(documentId, view) -> { markdown, complete, missing_parts }`。

### 3. Contracts

- source 始终 complete；translation 仅 active completed generation 有完整 `document_results`（或完整 legacy active generation）时 complete。
- 普通 Markdown 块用空行连接；相邻 table rows 合成为 header、GFM delimiter、data rows。
- 未完成译文一律返回空 Markdown，`missing_parts` 只作为内部/兼容状态，不得用于生成部分正文或导出。
- `blocks` 的 `markdown_kind` 在 schema v3 保存；v4 的 `document_results` 保存完整结果。v1/v2/v3 迁移保留已完成 active legacy 译文，未完成 legacy generation 不显示。

### 4. Validation & Error Matrix

- 不存在的文档 -> storage/query error，不返回空成功文档。
- translation succeeded 但正文为空或受保护 marker 不完整 -> protocol error，不提交。
- 部分失败/暂停 -> `complete=false`、空正文和文档级状态；不暴露任何局部结果。
- active generation 存在且 working generation 未完成 -> reader 继续返回 active 译文。

### 5. Good/Base/Bad Cases

- Good：React 学习一个 `DocumentContent` interface 就能显示、复制和导出整篇 Markdown。
- Base：旧 v2 记录按 paragraph 连续显示，已有译文保持不变。
- Bad：把 `blocks_for_document` 或术语 projection 暴露给 React，让执行模型再次决定阅读布局。

### 6. Tests Required

- interface 测试覆盖所有 Markdown kind、有效 GFM 表格、未完成结果不可见、v1/v2/v3→v4 迁移、原子重译和完成后 100% 快照。
- Rust/TS serde fixture 精确断言 view 与 content JSON shape。
- 真实 Tauri E2E 覆盖导入、即时翻译、导入后自动进入带加载层的译文、完成后显示完整译文、文件项按状态选择默认视图和删除清理。

### 7. Wrong vs Correct

#### Wrong

```typescript
const blocks = await documentBlocks(id);
return blocks.map(renderDualColumnRow);
```

#### Correct

```typescript
const content = await documentContent(id, view);
return <MarkdownDocument markdown={content.markdown} />;
```

## Scenario: 文档导入结果跨 Tauri IPC

### 1. Scope / Trigger

- Rust `ImportOutcome` 或前端 `ImportOutcome` 联合类型发生变化时，必须验证双方消费的是同一精确 JSON 形状；仅类型名相同不代表 Serde 输出兼容。

### 2. Signatures

- Tauri：`import_document(file_name: String, content: Vec<u8>) -> Result<ImportOutcome, String>`。
- 前端：`importDocument(fileName: string, content: Uint8Array): Promise<ImportOutcome>`。

### 3. Contracts

- 首次导入：`{"type":"imported","data":DocumentSnapshot}`。
- 内容重复：`{"type":"open_existing","data":DocumentSnapshot}`。
- 可预期拒绝：`{"type":"rejected","message":string}`；OCR 仍通过 `message` 返回“暂不支持”。

### 4. Validation & Error Matrix

- `imported` -> 使用 `data.id` 启动即时翻译，然后选择该记录。
- `open_existing` -> 使用 `data.id` 选择已有记录，不发起重新翻译。
- `rejected` -> 展示 `message`，不读取 `data`，不发起模型请求。
- 基础设施异常 -> 使用命令的 `Err(String)` 通道，不伪装成业务拒绝。

### 5. Good/Base/Bad Cases

- Good：Rust 成功变体显式声明结构字段 `data: DocumentSnapshot`，前端按带判别字段的联合类型消费。
- Base：拒绝变体保持扁平 `message`，无需构造空的 `data`。
- Bad：`#[serde(tag = "type")]` 配合 newtype 成功变体会把快照字段展平，导致前端读取 `outcome.data.id` 崩溃。

### 6. Tests Required

- Rust 序列化测试必须断言成功结果的 `data.id` 与拒绝结果的完整 JSON。
- 前端 store 测试必须用 JSON 往返后的 IPC 载荷断言首次导入会翻译并选中，重复导入只选中。

### 7. Wrong vs Correct

#### Wrong

```rust
#[serde(tag = "type")]
enum ImportOutcome { Imported(DocumentSnapshot) }
```

#### Correct

```rust
#[serde(tag = "type")]
enum ImportOutcome { Imported { data: DocumentSnapshot } }
```

## Scenario: 后台翻译失败原因可恢复

### 1. Scope / Trigger

- 修改文档任务启动、provider 调用、结果提交、进度事件、快照或失败 UI 时，失败原因必须进入 Rust 拥有的持久状态；异步任务失败不能只依赖一次 IPC `Err` 或 Toast。

### 2. Signatures

- SQLite schema v5：`documents.error_message TEXT NULL`。
- Rust：`mark_document_failed(document_id, error_message) -> Result<(), DocumentError>`。
- Rust/TS 快照：`DocumentSnapshot { ..., error_message: Option<String> }` / `error_message?: string`。
- Tauri event：`document-progress` 携带完整 `DocumentSnapshot`。

### 3. Contracts

- 配置/模型/provider 初始化等同步失败，以及 request 构造、provider、空响应、保存和完成提交等后台失败，都要写入 `status=failed` 与安全的 `error_message`，随后广播进度快照。
- `begin_translation`、暂停/取消、成功完成必须清除旧原因；重试期间不得继续显示上一次错误。
- v4→v5 只新增 nullable 列，不回填语言相关文本；旧失败记录保持 `NULL`，由前端按当前语言显示兜底。
- 持久化文案最多 500 字符，并脱敏 Bearer、token/access_token、api_key、Gemini `key` 等明显凭据形态。

### 4. Validation & Error Matrix

- `failed` / `partial_failed` + 有原因 -> 当前所选记录以错误 Toast 展示该原因；同一 `document_id + error_message` 只提示一次，列表保留失败状态和重试。
- `failed` / `partial_failed` + `NULL` -> 当前所选记录以错误 Toast 展示本地化“未记录具体失败原因，请重试”。
- 失败且没有 active 译文 -> reader 显示文档级失败占位，不得显示“翻译中”或失败详情；有旧 active 译文的重译失败 -> 保留旧译文，失败详情仍只走 Toast。
- 同步启动失败 -> store 刷新持久快照，不弹“已取消”或重复错误 Toast。
- 不存在的文档写失败状态 -> 返回 storage error，不创建孤立 generation。

### 5. Good/Base/Bad Cases

- Good：用户切换页面或重启应用后，持久快照仍能恢复失败原因；选中失败记录时 Toast 一次，列表始终可重试。
- Base：升级前的失败记录没有原因，仍显示当前语言的明确兜底。
- Bad：spawn 后立即返回成功，后台错误只写 `status=failed`；页面因空译文继续显示“翻译中”。

### 6. Tests Required

- document crate：v4→v5 迁移、失败原因重开仍存在、重试/取消/成功清除、失败重译保留 active 译文。
- app command：快照 serde 对齐、凭据脱敏与严格 500 字符上限；异步 provider/空响应/保存/完成/request 构造失败应有可控 fixture，断言持久快照与 `document-progress`。
- 前端：具体原因 Toast、同一失败去重、原因变化后再次提示、旧记录本地化兜底、reader 无失败详情/无“翻译中”、列表重试入口，以及同步启动失败不产生错误成功 Toast。
- 桌面回归：用失败记录验证顶部错误 Toast、列表 `错误` 状态与重试同时可观察，且 reader 没有重复原因；不得调用真实付费 provider 作为自动化 fixture。

### 7. Wrong vs Correct

#### Wrong

```rust
spawn(async move {
    if translate().await.is_err() {
        documents.mark_document_failed(id); // 原因丢失
    }
});
```

#### Correct

```rust
spawn(async move {
    if let Err(error) = translate().await {
        documents.mark_document_failed(id, safe_failure_message(&error))?;
        emit_document_progress(snapshot(id)?);
    }
});
```

# IPC 命令

`src/commands.rs`。这是 Rust 与 TypeScript 的唯一边界，改动前先读 [IPC 契约指南](../../guides/ipc-contract-guide.md)。

## 命令清单

9 个命令，注册顺序见 `src/lib.rs`（配置/Prompt/聊天在前，取词/朗读在后）：

| 命令 | 参数 | 成功返回 | 位置 |
|------|------|----------|------|
| `load_config` | `state` | `AppConfig` | `commands.rs:37-40` |
| `save_config` | `cfg: AppConfig`, `state` | `()` | `:43-46` |
| `effective_prompt` | `feature: Feature`, `state` | `String`（**含未替换的占位符**） | `:51-60` |
| `translation_plan` | `text`, `source_override?`, `target_override?`, `state` | `TranslationPlan { source, target }` | `commands.rs` |
| `effective_translation_prompt` | `source`, `target`, `state` | 已替换语言占位符且追加不可覆盖机器协议的 `String` | `commands.rs` |
| `chat_stream` | `feature`, `messages`, `on_event: Channel<ChatEvent>`, `state` | `()` | `:75-104` |
| `get_selection` | 无 | `Selection` | `:15-20` |
| `speak` | `text: String` | `()` | `:23-28` |
| `stop_speaking` | 无 | `()` | `:31-34` |

`stop_speaking` 在前端已导出但**无调用点**（`src/lib/ipc.ts:30-32`）——要么补上「停止朗读」入口，要么删掉。

## 错误一律拍平为 String

9 个命令全部返回 `Result<T, String>`，Rust 错误在边界处 `.map_err(|e| e.to_string())`。前端无法按错误种类分支，只能展示文本。

这是有意的规模取舍，不是疏漏。新增命令照此办理——**不要**为单个命令引入自定义可序列化错误枚举，那会让边界出现两套约定。真要做结构化错误，是一次统一改造。

## 流式与广播是两套原语

**请求作用域流式** → `tauri::ipc::Channel<ChatEvent>`（`commands.rs:6`）：

```rust
#[serde(tag = "type", rename_all = "snake_case")]
enum ChatEvent {
    Chunk { delta: String },
    Status { message: String },
    Done,
    Error { message: String },
}
```

驱动逻辑：`stream.next().await` 循环，每项 `on_event.send(...)`；零输出且可重试的错误最多重建一次流，429 进入进程共享冷却并发送 `Status`。不可重试或已有部分输出时**既发 `ChatEvent::Error`、又返回 `Err`**，所以前端会同时收到带内错误事件和 `invoke` 拒绝；错误路径不再发送 `Done`。

`.send()` 的失败用 `.ok()` 静默丢弃（`:93-97,102`）——前端通道已关闭时通知不到也不报错。改这段时留意这个既有行为。

**全局广播** → `AppHandle::emit()`，事件名 `"hotkey-status"`（`hotkeys.rs:28`）、`"translate-selection"`（`hotkeys.rs:129`）。前端用 `listen()` 且**必须退订**。

新增能力时按这个标准选：一次请求对应一条流用 `Channel`；不定时的系统事件用 `emit`。

## Scenario：翻译语言计划、术语信封与共享冷却

### 1. Scope / Trigger

- Trigger：翻译入口需要跨 Rust core、Tauri IPC、LLM 文本流和 TypeScript store 同时保持一致；任何一侧私自解析语言、覆盖机器协议或新增事件都会造成运行期漂移。

### 2. Signatures

```rust
translation_plan(
    text: String,
    source_override: Option<Language>,
    target_override: Option<Language>,
    state: State<'_, AppState>,
) -> Result<TranslationPlan, String>

effective_translation_prompt(
    source: Language,
    target: Language,
    state: State<'_, AppState>,
) -> Result<String, String>

chat_stream(
    feature: Feature,
    messages: Vec<ChatMessage>,
    on_event: Channel<ChatEvent>,
    state: State<'_, AppState>,
) -> Result<(), String>
```

TypeScript 参数必须用 Tauri 的 camelCase 命令参数名：`sourceOverride`、`targetOverride`、`onEvent`。

### 3. Contracts

- `TranslationPlan` 两侧均为 `{ source: "zh" | "en" | "ja", target: ... }`；显式选择优先，其次使用 core 的检测、语言映射、界面语言和全局目标规则。
- `effective_translation_prompt` 先替换 `{source_lang}` / `{target_lang}`，再追加 `<<<LINGOSTACK_TERMS_V1>>>` 协议；用户 Prompt 只能改变风格，不能删除协议。
- 信封为“译文 + 独立 sentinel 行 + JSON 数组”。前端只流式发布译文；JSON 完成后逐项过滤字段、类别、上下文词面和大小写重复项，最多发布 5 项。不得维护普通词黑名单；专业性由固定 Prompt、类别和验收样例约束。
- `ChatEvent.status` 只表达仍在处理的诊断状态，不结束任务。`done` 才正常完成；`error` 保留已显示译文。
- `AppState.rate_limit_until` 是进程共享截止时间；任一请求遇到 429 只延长截止时间，之后进入的请求先发送 `status` 再等待，锁内不得 sleep。

### 4. Validation & Error Matrix

| 条件 | 行为 |
|------|------|
| 无 sentinel 的旧模型输出 | 全部作为译文，术语为空 |
| JSON 不是数组或无法解析 | 保留译文、隐藏术语、给出非阻塞诊断 |
| 单项字段/类别/词面无效 | 仅丢弃该项，不污染译文或其他合法项 |
| 超过 5 个合法项 | 只保留前 5 项 |
| 网络/超时/5xx/429 且零输出 | 最多自动重试一次 |
| 401/403、协议错误或已有部分输出 | 不自动重放；发送 `error` 并返回 `Err` |
| 共享 429 冷却未结束 | 新请求发送 `status` 后等待剩余时间 |

### 5. Good/Base/Bad Cases

- Good：流式译文完成后发布 0–5 个上下文 IT 术语，hover/focus 均可读解释。
- Base：纯文本旧响应仍完整显示，不渲染空术语区。
- Bad：把 sentinel/JSON 直接拼进 `output`，或在已有部分译文后自动重放请求，都会造成协议泄漏或重复计费。

### 6. Tests Required

- core：显式语言覆盖优先级、固定协议不能被自定义 Prompt 覆盖。
- provider wiremock：OpenAI、Anthropic、Gemini 归一化后都产生相同信封文本。
- Rust 应用层：零输出重试矩阵、共享冷却只延长、`ChatEvent.status` JSON 形状。
- TypeScript：sentinel 任意分片、缺失/损坏 JSON、无效项过滤、大小写去重和最多 5 项。
- RTL：术语区为空时不渲染；tag hover、focus、Escape 可观察。
- 真实边界：IPC 改动后至少运行一次 `pnpm tauri dev` 往返。

### 7. Wrong vs Correct

#### Wrong

```ts
output += event.delta; // sentinel 与 JSON 会进入用户译文
```

#### Correct

```ts
output = parser.push(event.delta); // 只发布已确认不是协议前缀的译文
```

## 提供商工厂

`build_provider(&ProviderConfig) -> Result<Box<dyn LlmProvider>, String>`（`:109-132`）按 `p.kind` 分派。`OpenAiCompatible` 与 `Ollama` **共用一个分支**（Ollama 同协议，`:108` 注释写明）。

`chat_stream` 先 `cfg.resolve_model(feature)` 解析出该功能用哪个提供商与模型（`:84`），再建 provider。

这个 match **无通配分支**，所以 `ProviderKind` 加变体会直接编译失败——这才是完备性保障。`:171-172` 那条注释声称是测试在保障，说法不准确。

## 加命令的完整动作

1. 在 `commands.rs` 写 `#[tauri::command]`，错误 `.map_err(|e| e.to_string())`
2. 在 `src/lib.rs:39-47` 的 `generate_handler!` 里注册（**漏了这步会在运行时报「命令不存在」，编译不报错**）
3. 在 `src/lib/ipc.ts` 加类型化封装——**前端不允许绕过它直接 `invoke` 业务命令**
4. 涉及新类型 → 同步 `src/lib/config-types.ts`
5. 跑 `pnpm tauri dev` 实测往返

第 3 条有既有边界：全前端只有 `App.tsx:2`（事件 API）与 `title-bar.tsx:2`（窗口 API）直接引 `@tauri-apps/api`，那是命令之外的模块，不算破例。业务命令一律走 `ipc.ts`。

## ACL

`capabilities/default.json` 只作用于 `"main"` 窗口，声明 `core:default`、四个窗口控制权限（minimize / toggle-maximize / is-maximized / start-dragging / close）、`core:event:default`。

自定义 `#[tauri::command]` **不需要** ACL 条目——那里只管插件权限。加自定义命令时不用动这个文件；要用新的窗口 API 或插件能力时才需要。

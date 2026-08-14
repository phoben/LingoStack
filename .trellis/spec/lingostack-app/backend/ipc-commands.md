# IPC 命令

`src/commands.rs`。这是 Rust 与 TypeScript 的唯一边界，改动前先读 [IPC 契约指南](../../guides/ipc-contract-guide.md)。

## 命令清单

10 个命令，注册顺序见 `src/lib.rs`（配置/热键/Prompt/聊天在前，取词/朗读在后）：

| 命令 | 参数 | 成功返回 | 位置 |
|------|------|----------|------|
| `load_config` | `state` | `AppConfig` | `commands.rs:37-40` |
| `save_config` | `cfg: AppConfig`, `state` | `()` | `:43-46` |
| `register_hotkeys` | `bindings: Vec<HotkeyBinding>`, `app`, `state` | `HotkeyStatus[]` | `commands.rs` |
| `effective_prompt` | `feature: Feature`, `state` | `String`（**含未替换的占位符**） | `:51-60` |
| `translation_plan` | `text`, `source_override?`, `target_override?`, `effective_system_language?`, `state` | `TranslationPlan { source, target }` | `commands.rs` |
| `effective_translation_prompt` | `source`, `target`, `state` | 已替换语言占位符且追加不可覆盖机器协议的 `String` | `commands.rs` |
| `chat_stream` | `feature`, `messages`, `on_event: Channel<ChatEvent>`, `state` | `()` | `:75-104` |
| `get_selection` | 无 | `Selection` | `:15-20` |
| `speak` | `text: String` | `()` | `:23-28` |
| `stop_speaking` | 无 | `()` | `:31-34` |

`speak` / `stop_speaking` 由共享 `tts-store` 调用，翻译页与收藏页复用同一 active utterance 状态。

## 错误一律拍平为 String

10 个命令全部返回 `Result<T, String>`，Rust 错误在边界处 `.map_err(|e| e.to_string())`。前端无法按错误种类分支，只能展示文本。

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

**全局广播** → `AppHandle::emit()`，事件名 `"hotkey-status"`、`"translate-selection"`、`"navigate-view"`。前端用 `listen()` 且**必须退订**。热键发出的 `translate-selection` 带预捕获的 `{ selection?: Selection, error?: string }`；托盘动作可发空载荷并由前端调用 `get_selection` 走既有降级。

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
    effective_system_language: Option<Language>,
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

TypeScript 参数必须用 Tauri 的 camelCase 命令参数名：`sourceOverride`、`targetOverride`、`effectiveSystemLanguage`、`onEvent`。

### 3. Contracts

- `TranslationPlan` 两侧均为 `{ source: "zh" | "en" | "ja", target: ... }`；显式选择优先，其次使用 core 的检测、语言映射、界面语言和全局目标规则。`ui_language = system` 时，前端必须把已解析的系统语言作为 `effective_system_language` 传入，缺失时 core 保守回退英文。
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

## Scenario：设置持久化与热键即时重注册

### 1. Scope / Trigger

- Trigger：用户在设置页修改提供商、模型、语言规则、Prompt、主题或热键；保存后本次会话立即生效，重启后保持一致。
- 热键设置跨越 React、IPC、磁盘配置和 Windows 全局注册器，必须让冲突成为用户可见状态，不能只把 JSON 写成功当作完成。

### 2. Signatures

```rust
register_hotkeys(
    bindings: Vec<HotkeyBinding>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<HotkeyStatus>, String>

reregister_and_report(
    app: &AppHandle,
    bindings: &[HotkeyBinding],
) -> Vec<HotkeyStatus>
```

```ts
registerHotkeys(bindings: HotkeyBinding[]): Promise<HotkeyStatus[]>
```

### 3. Contracts

- `register_hotkeys` 先把绑定合入当前 `AppConfig` 并规范化落盘，再注销本应用的全部旧注册项、逐条注册新绑定，并同时返回和广播完整状态。
- 单条注册失败不回滚已成功项，也不阻止应用启动；`HotkeyStatus` 必须包含动作、规范化加速器、成功标记及可选错误。
- 前端保存前拒绝空主键、裸键和应用内重复组合；系统或其他应用占用只能以后端注册结果为准，并在对应条目就地显示。
- 应用加载配置后主动调用一次 `register_hotkeys`，避免启动期广播早于监听器导致状态丢失。
- 配置模型只保留 `show_main_window` 与 `translate_selection` 两个 V1 动作；旧的 `translate_popup` 读取为 `translate_selection`，再次保存时只写新名称。

### 4. Validation & Error Matrix

| 条件 | 行为 |
|------|------|
| 空主键或无修饰键 | 前端阻止保存；后端注册层仍返回 `registered=false` |
| 两个应用动作使用同一组合 | 前端阻止保存并定位重复项 |
| 系统或其他应用占用 | 保存保留，当前项标红；其他合法项继续生效 |
| 配置文件读取/写入失败 | IPC 返回 `Err(String)`，前端保留用户输入并展示错误 |
| 旧 `translate_popup` | 无损迁移到 `translate_selection`，规范化后去重 |
| 重注册调用成功但个别项失败 | Promise 正常返回状态数组，不把部分冲突提升为命令失败 |

### 5. Good/Base/Bad Cases

- Good：修改热键后无需重启即可触发新组合；若冲突，用户能看到失败原因并改成可用组合恢复。
- Base：保持两个默认绑定时，启动后状态可观察，语言、主题和其他设置重启后不丢失。
- Bad：只调用 `save_config` 而不重新注册，界面会显示新键但系统仍监听旧键；注册失败时整体回滚会误伤另一条可用绑定。

### 6. Tests Required

- core：默认仅两条且无内部冲突；旧动作别名反序列化后写回新名称；规范化对每个动作只保留一条。
- app Rust：配置 load/save 都执行规范化；`HotkeyStatus` 成功态省略错误、失败态包含错误。
- TypeScript：捕获组合、裸键与重复组合校验、保存失败、注册成功与部分失败状态。
- RTL：设置项可编辑；冲突就地可见；修改语言后当前页面立即切换文案。
- 真实边界：Windows 上至少验证一次“修改并保存 → 即时重注册 → 重启保持 → 冲突后更换组合恢复”。

### 7. Wrong vs Correct

#### Wrong

```ts
await saveConfig({ ...config, hotkeys }); // 磁盘变了，系统注册仍是旧值
```

#### Correct

```ts
const statuses = await registerHotkeys(hotkeys);
setHotkeyStatuses(statuses); // 保存、重注册与可观察结果是一个业务动作
```

## Scenario：划词捕获、主窗口路由与关闭到托盘

### 1. Scope / Trigger

- Trigger：用户在其他应用按“划词翻译”热键，或通过托盘/第二实例显示既有主窗口；该链路跨 Windows UIA、Rust 热键回调、Tauri event、React store 与窗口 ACL。

### 2. Signatures

```rust
struct TranslateSelectionPayload {
    selection: Option<Selection>,
    error: Option<String>,
}

fn apply_effect(app: &AppHandle, effect: HotkeyEffect)
```

```ts
listen<TranslateSelectionPayload | undefined>("translate-selection", handler)
listen<AppView>("navigate-view", handler)
```

### 3. Contracts

- 热键路径必须在原应用仍是前台、LingoStack 尚未 `show/set_focus` 时同步调用 selection provider，再显示主窗口并 emit 载荷。
- `selection.source=accessibility` 直接注入且不显示降级提示；`clipboard` 注入并显示非阻塞提示；`error` 显示手动粘贴恢复建议。
- 所有导航复用 label=`main` 的窗口，不创建翻译浮窗；事件监听卸载时必须退订。
- 标题栏关闭与原生 CloseRequested 都隐藏窗口，不退出进程；只有托盘“退出”调用 `app.exit(0)`。
- `capabilities/default.json` 必须包含 `core:window:allow-hide`；只有 React 调用了 `window.hide()` 而未授权会在运行时静默失败，编译与 mock 测试捕获不到。
- 第二实例只能唤醒既有实例并自行退出；默认 `Alt+Space` 可重新显示隐藏窗口。

### 4. Validation & Error Matrix

| 条件 | 行为 |
|------|------|
| UIA 有非空选区 | 载荷 source=accessibility，注入原文并自动翻译 |
| UIA 无选区、剪贴板有文本 | source=clipboard，显示降级提示 |
| 两级均失败 | error 提示手动粘贴，不无声清空现有输入 |
| 先聚焦主窗口再调用 `get_selection` | 禁止；会读取 LingoStack 自身焦点并误降级 |
| 标题栏关闭 / Alt+F4 | main 隐藏，进程和托盘保留 |
| 第二实例启动 | 新进程短时退出，常驻实例数仍为 1 |

### 5. Good/Base/Bad Cases

- Good：外部 WPF/Win32 文本选区按热键后原样进入主窗口，无剪贴板提示。
- Base：不支持 UIA 的应用从剪贴板取词，用户明确知道发生了降级。
- Bad：`show → set_focus → get_selection` 会稳定读取错误窗口；遗漏 hide ACL 会让关闭按钮看似可点但窗口不消失。

### 6. Tests Required

- Rust：动作映射、payload serde、托盘五项 id、关闭事件注册与单实例回调代码路径。
- RTL：预捕获 UIA payload 不再调用 `getSelection`；空载荷覆盖剪贴板降级；错误包含手动粘贴建议；事件卸载退订。
- 权限/构建：`pnpm tauri build` 或 `cargo build -p lingostack-app` 解析 capability。
- Windows 真实边界：WPF/Notepad 选区热键、受控剪贴板降级、标题栏关闭、Alt+F4、Alt+Space 唤回与第二实例计数。

### 7. Wrong vs Correct

#### Wrong

```rust
window.set_focus();
app.emit("translate-selection", ()); // 前端此时再取词，焦点已经丢失
```

#### Correct

```rust
let payload = capture_selection();
window.set_focus();
app.emit("translate-selection", payload);
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

`capabilities/default.json` 只作用于 `"main"` 窗口，声明 `core:default`、窗口控制权限（minimize / toggle-maximize / is-maximized / start-dragging / **hide** / close）与 `core:event:default`。

自定义 `#[tauri::command]` **不需要** ACL 条目——那里只管插件权限。加自定义命令时不用动这个文件；要用新的窗口 API 或插件能力时才需要。

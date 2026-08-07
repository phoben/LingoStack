# IPC 命令

`src/commands.rs`。这是 Rust 与 TypeScript 的唯一边界，改动前先读 [IPC 契约指南](../../guides/ipc-contract-guide.md)。

## 命令清单

7 个命令，注册顺序见 `src/lib.rs:39-47`（配置/Prompt/聊天在前，取词/朗读在后）：

| 命令 | 参数 | 成功返回 | 位置 |
|------|------|----------|------|
| `load_config` | `state` | `AppConfig` | `commands.rs:37-40` |
| `save_config` | `cfg: AppConfig`, `state` | `()` | `:43-46` |
| `effective_prompt` | `feature: Feature`, `state` | `String`（**含未替换的占位符**） | `:51-60` |
| `chat_stream` | `feature`, `messages`, `on_event: Channel<ChatEvent>`, `state` | `()` | `:75-104` |
| `get_selection` | 无 | `Selection` | `:15-20` |
| `speak` | `text: String` | `()` | `:23-28` |
| `stop_speaking` | 无 | `()` | `:31-34` |

`stop_speaking` 在前端已导出但**无调用点**（`src/lib/ipc.ts:30-32`）——要么补上「停止朗读」入口，要么删掉。

## 错误一律拍平为 String

7 个命令全部返回 `Result<T, String>`，Rust 错误在边界处 `.map_err(|e| e.to_string())`。前端无法按错误种类分支，只能展示文本。

这是有意的规模取舍，不是疏漏。新增命令照此办理——**不要**为单个命令引入自定义可序列化错误枚举，那会让边界出现两套约定。真要做结构化错误，是一次统一改造。

## 流式与广播是两套原语

**请求作用域流式** → `tauri::ipc::Channel<ChatEvent>`（`commands.rs:6`）：

```rust
#[serde(tag = "type", rename_all = "snake_case")]
enum ChatEvent { Chunk { delta: String }, Done, Error { message: String } }
```

（`:63-72`）驱动逻辑（`:86-101`）：`stream.next().await` 循环，每项 `on_event.send(...)`；出错时**既发 `ChatEvent::Error` 事件、又返回 `Err`**（`:98`），所以前端会同时收到带内错误事件和 `invoke` 拒绝。循环结束后无条件发 `Done`（`:102`）。

`.send()` 的失败用 `.ok()` 静默丢弃（`:93-97,102`）——前端通道已关闭时通知不到也不报错。改这段时留意这个既有行为。

**全局广播** → `AppHandle::emit()`，事件名 `"hotkey-status"`（`hotkeys.rs:28`）、`"translate-selection"`（`hotkeys.rs:129`）。前端用 `listen()` 且**必须退订**。

新增能力时按这个标准选：一次请求对应一条流用 `Channel`；不定时的系统事件用 `emit`。

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

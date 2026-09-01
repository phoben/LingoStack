# lingostack-tts 开发规范

> 系统朗读。Windows 走 SAPI；macOS / Linux 为占位实现。

路径：`crates/lingostack-tts`

## 开发前检查清单

- [ ] **必读** [平台隔离指南](../../guides/platform-isolation-guide.md)
- [ ] 读了 [Rust 通用约定](../../guides/rust-conventions.md)
- [ ] 想让 `WindowsSpeaker` 直接持有 voice 实例？先看下面「voice 常驻朗读线程」那节，那会违反 trait 约束
- [ ] 想在 `speak()` 里等播完？也看那节——曾因实例提前释放导致「点了没声音」
- [ ] 动 macOS / Linux？在结论里标注「需在目标平台验证」
- [ ] 已按 [全仓测试策略](../../lingostack-app/backend/testing-strategy.md) 区分线程结构测试、目标平台运行与真实播音验收

## 结构

| 文件             | 内容                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| `src/lib.rs`     | `TtsError`、`SpeechOutcome` / `SpeechCompletion`、`Speaker` trait、平台模块声明与工厂 |
| `src/windows.rs` | SAPI 实现 + 专用朗读线程 + 自然完成状态检测（见下节）                                 |
| `src/macos.rs`   | 占位。需 `AVSpeechSynthesizer`（经 objc 绑定），见 `:1-7`                             |
| `src/linux.rs`   | 占位。需 speech-dispatcher / `spd-say`，见 `:1-6`                                     |

与 `lingostack-selection` 同构，两个 crate 的 `lib.rs` 可互相参照。

## 关键约束：voice 常驻朗读线程，`Speaker` 不持有它

`ISpVoice` 绑定 COM apartment，**不是 `Send + Sync`**，而 `Speaker` trait 要求 `Send + Sync`。所以 `WindowsSpeaker` **不能持有 voice 实例**（`windows.rs:3-6`）——这条约束始终成立。

**但也不能在 `speak()` 里就地创建实例。** 朗读走 `SPF_ASYNC` 立即返回，函数返回即 drop、引用计数归零，朗读随实例一起被销毁。实测：提交后立即释放实例产出 46 字节（等于静音），保留实例则同句产出 190,698 字节。这正是 issue #2「点了没声音」的根因。

现行结构（`windows.rs:1-11` 有完整推导）：

| 角色             | 位置                           | 说明                                                                      |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `WindowsSpeaker` | `windows.rs`                   | **无字段**，故天然 `Send + Sync`                                          |
| 指令通道         | `VOICE_TX`                     | `Mutex<Option<Sender<Cmd>>>`，进程内单例，惰性启动                        |
| 朗读线程         | `voice_loop()`                 | COM 初始化 + 建实例各一次；实例常驻，并轮询运行状态与接收指令             |
| 指令投递         | `dispatch_speak/dispatch_stop` | 回执只表示引擎已受理；`SpeechCompletion` 另行报告结束、中断或状态监测错误 |

**单实例是「打断上一句」的前提，不是优化。** `SPF_PURGEBEFORESPEAK` 只在同一实例内生效——两个独立实例各自 purge **互不打断**（已实测）。所以若改回「每次调用新建实例」，`lib.rs:12-14` 承诺的「打断上一句」会失效，用户连点两次朗读听到两句重叠。

改这个文件前先确认新写法同时满足五条：实例活到播完、`speak()` 不阻塞调用方、打断跨调用有效、`Send + Sync` 不破、自然结束与状态监测错误都能回到前端终态。

`windows.rs:220-223` 有一个 `Send + Sync` 编译期断言测试，值得在同类 crate 里照抄。

## Windows 原生调用约定

- COM 初始化在 `create_voice()` 内做，忽略返回值（`:64-74`）。**该函数只在朗读线程内调用**，全进程仅执行一次
- 朗读线程内提交也用 `SPF_ASYNC`（`:76-90`）：让线程立刻回到收指令状态，停止指令才不必排在长句之后
- 有 active utterance 时，线程以短周期 `recv_timeout` 同时接收 Speak/Stop 并调用 `ISpVoice::GetStatus`；只有 `SPRS_DONE` 报告 `Finished`。GetStatus 失败必须通过完成句柄报告错误，禁止当成“还没播完”继续等待
- 新 Speak / Stop 先把旧完成句柄报告为 `Interrupted`；中断不得伪装成自然完成，否则旧请求会错误复位当前按钮
- 失效恢复：线程无响应或已退出时清掉单例（`clear_thread()`，`:145`），下次调用重建。初始化失败**不缓存**——多为音频设备被占用等暂态
- 锁被 panic 毒化时取内部值继续用（`:134`）：朗读不是一致性敏感状态
- `unsafe` 用逐调用小块，每块上方各自的 `// SAFETY:` 注释（`:68-73`、`:84-89`）——与 `lingostack-selection` 的大块包裹风格不同，两种都可接受
- **错误保留 HRESULT 信息**：`.map_err(|e| TtsError::Failed(format!("...: {e}")))`（`:71,87`）
- 无 `CoUninitialize`

## 占位实现

macOS / Linux 返回 `Err(TtsError::Unsupported)`（`macos.rs:27-34`、`linux.rs:26-33`），绝不 panic、绝不静默成功。占位模块都有断言 `Unsupported` 的测试。

实装时删占位测试、补真实测试。

## 测试的天花板

Windows 的 `speak_does_not_panic` 无法断言真的出声，只能断言返回 `Ok` 或 `Failed` 变体——CI 环境无音频设备。这是固有上限。

上限之内仍可断言的结构性质，三条都在守着上面那节的约束：

- `speak_returns_without_waiting_for_playback`（`:229`）：耗时上界，证明未同步等播完
- `repeated_speak_and_stop_do_not_deadlock`（`:253`）：交替调用不卡死，若线程被长句阻塞会卡到 `ACK_TIMEOUT`
- `repeated_speak_reuses_one_voice_thread`（`:273`）：两次朗读之间没新起线程（打断语义的结构前提）。断的是差值不是绝对计数——同进程其他测试也共用这条线程

三条都在环境无语音引擎时提前返回，不让 CI 因缺设备变红。

**真的出声只能手工验**。若需可复现的音频证据，把线程模型照搬到一个临时探针里、用 `SpFileStream` 把输出重定向到 WAV 再比对字节数——issue #2 修复时即以此取证（发声 387,528 字节 / 零间隔叫停 0 字节 / 零间隔连点 109,364 字节，与「只读第二句」基准完全一致）。探针属一次性工具，不进仓库。

## 质量检查

```bash
cargo clippy --all-targets -- -D warnings
cargo test -p lingostack-tts
```

## Scenario：朗读开始、自然完成与停止

### 1. Scope / Trigger

- Trigger：翻译页或收藏页提交朗读、等待自然播放完成、切换文本、快速连点或主动停止；状态跨 React、Zustand、Tauri IPC Channel 和 SAPI 常驻线程。

### 2. Signatures

```ts
type TtsStatus = "idle" | "submitting" | "speaking" | "error";
type TtsEvent =
  | { type: "started" }
  | { type: "done" }
  | { type: "error"; message: string };
speak(text: string, onEvent: (event: TtsEvent) => void): Promise<void>;
speakText(text: string): Promise<void>;
stop(): Promise<void>;
```

```rust
speak(text: String, on_event: Channel<TtsEvent>) -> Result<(), String>
stop_speaking() -> Result<(), String>

trait Speaker {
    fn speak(&self, text: &str) -> Result<SpeechCompletion, TtsError>;
    fn stop(&self) -> Result<(), TtsError>;
}
```

### 3. Contracts

- `useTtsStore` 是翻译页与收藏页的共享状态源；同一时间只有一个 active utterance，各页面不自行加完成计时器。
- `speak` invoke 成功只表示命令与完成监听已建立；`started` 才进入 `speaking`，SAPI 的 `SPRS_DONE` 经完成句柄与 `done` 事件驱动 `idle`。
- 用户停止或后一条朗读替换当前项时，旧完成句柄返回 `Interrupted` 且不发送 `done`。
- 每次 speak/stop 递增请求代次；旧请求的 Promise、`done` 或 `error` 都不得覆盖新请求状态。
- 翻译流仍在输出时，只要已有 active utterance，停止按钮必须保持可用。
- 提交错误、Unsupported、SAPI 状态读取错误和完成监听线程启动失败都进入可读 error/alert；空文本不提交 IPC。
- macOS / Linux 占位实现继续返回 `Unsupported`，不能发送伪造 started/done/error。

### 4. Validation & Error Matrix

| 条件                                     | 行为                                                         |
| ---------------------------------------- | ------------------------------------------------------------ |
| 空白文本                                 | 不调用 `speak`，保持 idle                                    |
| `speak` 拒绝或完成监听线程无法启动       | 状态 error，展示可读错误                                     |
| 收到当前请求 `started`                   | 状态 speaking，按钮显示停止                                  |
| SAPI 报告 `SPRS_DONE` / 收到当前 `done`  | 清空 active utterance，回到 idle，按钮恢复喇叭               |
| SAPI GetStatus 失败 / 收到当前 `error`   | 状态 error，清空 active utterance并展示消息                  |
| stop 成功                                | 清空 active utterance，回到 idle；旧 done 被 generation 忽略 |
| stop 拒绝                                | 状态 error，不伪装已停止                                     |
| speak A 后 speak B，A 的 done/error 迟到 | 忽略 A 的过期事件，只保留 B 状态                             |
| 非 Windows Unsupported                   | 展示错误，不静默成功                                         |

### 5. Good/Base/Bad Cases

- Good：点击朗读后按钮变为“停止朗读”，自然播放完无需点击即恢复喇叭；快速切换句子只保留最新状态。
- Base：没有可朗读文本时按钮禁用或不提交。
- Bad：按字符数估算时长会过早/过晚复位；把 GetStatus 错误吞成 false 会永久停在停止态；让旧 done 覆盖新请求会让正在播放的 B 错误恢复喇叭。

### 6. Tests Required

- store：started、自然 done、监测 error、停止、旧 done 迟到、A 被 B 替换与 invoke 拒绝。
- RTL：朗读/停止标签切换、错误 `role=alert`、翻译 streaming 时停止仍可用。
- Rust：`SpeechCompletion` 成功/中断/错误传播，常驻线程复用、非阻塞提交、重复 speak/stop 无死锁，`TtsEvent` serde 与 TS 镜像一致。
- feature-gated 桌面 E2E：真实 command/Channel 先观察停止控件，再自动恢复喇叭；fixture 必须异步完成且与生产路径隔离。
- Windows 真实边界：实际可听朗读自然结束后观察图标复位；自动化不得冒充物理听感证据。

### 7. Wrong vs Correct

#### Wrong

```ts
await speak(text);
setTimeout(() => set({ status: "idle" }), estimate(text));
// 文本长度无法代表系统语音的真实完成时间
```

#### Correct

```ts
await speak(text, (event) => {
  if (!requestIsCurrent()) return;
  if (event.type === "started") set({ status: "speaking", text });
  if (event.type === "done") set({ status: "idle", text: null });
  if (event.type === "error")
    set({ status: "error", text: null, error: event.message });
});
```

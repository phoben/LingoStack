# lingostack-tts 开发规范

> 系统朗读。Windows 走 SAPI；macOS / Linux 为占位实现。

路径：`crates/lingostack-tts`（102 + 286 + 48 + 47 行）

## 开发前检查清单

- [ ] **必读** [平台隔离指南](../../guides/platform-isolation-guide.md)
- [ ] 读了 [Rust 通用约定](../../guides/rust-conventions.md)
- [ ] 想让 `WindowsSpeaker` 直接持有 voice 实例？先看下面「voice 常驻朗读线程」那节，那会违反 trait 约束
- [ ] 想在 `speak()` 里等播完？也看那节——曾因实例提前释放导致「点了没声音」
- [ ] 动 macOS / Linux？在结论里标注「需在目标平台验证」
- [ ] 已按 [全仓测试策略](../../lingostack-app/backend/testing-strategy.md) 区分线程结构测试、目标平台运行与真实播音验收

## 结构

| 文件             | 内容                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `src/lib.rs`     | `TtsError`、`Speaker` trait（`:10-19`）、`#[cfg]` 模块声明与 `speaker()` 工厂（`:35-60`） |
| `src/windows.rs` | SAPI 实现 + 专用朗读线程（见下节）                                                        |
| `src/macos.rs`   | 占位。需 `AVSpeechSynthesizer`（经 objc 绑定），见 `:1-7`                                 |
| `src/linux.rs`   | 占位。需 speech-dispatcher / `spd-say`，见 `:1-6`                                         |

与 `lingostack-selection` 同构，两个 crate 的 `lib.rs` 可互相参照。

## 关键约束：voice 常驻朗读线程，`Speaker` 不持有它

`ISpVoice` 绑定 COM apartment，**不是 `Send + Sync`**，而 `Speaker` trait 要求 `Send + Sync`。所以 `WindowsSpeaker` **不能持有 voice 实例**（`windows.rs:3-6`）——这条约束始终成立。

**但也不能在 `speak()` 里就地创建实例。** 朗读走 `SPF_ASYNC` 立即返回，函数返回即 drop、引用计数归零，朗读随实例一起被销毁。实测：提交后立即释放实例产出 46 字节（等于静音），保留实例则同句产出 190,698 字节。这正是 issue #2「点了没声音」的根因。

现行结构（`windows.rs:1-11` 有完整推导）：

| 角色             | 位置                    | 说明                                                        |
| ---------------- | ----------------------- | ----------------------------------------------------------- |
| `WindowsSpeaker` | `:48`                   | **无字段**，故天然 `Send + Sync`                            |
| 指令通道         | `VOICE_TX`（`:42`）     | `Mutex<Option<Sender<Cmd>>>`，进程内单例，惰性启动          |
| 朗读线程         | `voice_loop()`（`:92`） | COM 初始化 + 建实例各一次，实例**常驻此线程且从不越出**     |
| 指令投递         | `dispatch()`（`:151`）  | 递一条指令 + 等一次回执，回执只表示「引擎已受理」，不等播完 |

**单实例是「打断上一句」的前提，不是优化。** `SPF_PURGEBEFORESPEAK` 只在同一实例内生效——两个独立实例各自 purge **互不打断**（已实测）。所以若改回「每次调用新建实例」，`lib.rs:12-14` 承诺的「打断上一句」会失效，用户连点两次朗读听到两句重叠。

改这个文件前先确认新写法同时满足四条：实例活到播完、`speak()` 不阻塞调用方、打断跨调用有效、`Send + Sync` 不破。

`windows.rs:220-223` 有一个 `Send + Sync` 编译期断言测试，值得在同类 crate 里照抄。

## Windows 原生调用约定

- COM 初始化在 `create_voice()` 内做，忽略返回值（`:64-74`）。**该函数只在朗读线程内调用**，全进程仅执行一次
- 朗读线程内提交也用 `SPF_ASYNC`（`:76-90`）：让线程立刻回到收指令状态，停止指令才不必排在长句之后
- 失效恢复：线程无响应或已退出时清掉单例（`clear_thread()`，`:145`），下次调用重建。初始化失败**不缓存**——多为音频设备被占用等暂态
- 锁被 panic 毒化时取内部值继续用（`:134`）：朗读不是一致性敏感状态
- `unsafe` 用逐调用小块，每块上方各自的 `// SAFETY:` 注释（`:68-73`、`:84-89`）——与 `lingostack-selection` 的大块包裹风格不同，两种都可接受
- **错误保留 HRESULT 信息**：`.map_err(|e| TtsError::Failed(format!("...: {e}")))`（`:71,87`）
- 无 `CoUninitialize`

## 占位实现

macOS / Linux 返回 `Err(TtsError::Unsupported)`（`macos.rs:27-34`、`linux.rs:26-33`），绝不 panic、绝不静默成功。占位模块都有断言 `Unsupported` 的测试。

实装时删占位测试、补真实测试。

## 测试的天花板

`windows.rs:184-286`：`speak_does_not_panic`（`:200`）无法断言真的出声，只能断言返回 `Ok` 或 `Failed` 变体——CI 环境无音频设备。这是固有上限。

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

## 前端接入现状

`speak` 已接通，但 `stop_speaking` 在前端已导出却**无调用点**（`src/lib/ipc.ts:30-32`）——要么补「停止朗读」入口，要么删掉这个导出。

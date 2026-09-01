# 技术设计：朗读自然结束后状态复位

## 1. 根因与目标状态机

当前链路只有“提交并受理”：React 调用 `speak`，Rust 把 `SPF_ASYNC` 请求交给 SAPI 后立即返回，store 进入 `speaking`。由于没有“自然结束”反向信号，UI 永远不知道何时回到 `idle`。

目标状态机为：

```text
idle -> submitting -> speaking -> idle
                    \-> error
```

其中 `speaking -> idle` 可由自然结束或主动停止触发，但两者必须能区分；旧请求的任何事件都受前端请求代次保护。

## 2. `lingostack-tts` 完成契约

`Speaker::speak` 在保持非阻塞提交的同时返回一个只代表本次 utterance 的完成句柄。完成结果至少区分：

- `Finished`：SAPI 报告当前语流自然播放完成。
- `Interrupted`：用户停止或后一条朗读替换了本次语流。

Windows 常驻朗读线程继续独占 `ISpVoice`。线程维护一个 active completion sender，并用短周期 `recv_timeout` 同时完成两件事：

1. 响应新的 Speak / Stop 指令，保持停止与打断及时可用；
2. 在 active utterance 存在时调用 `ISpVoice::GetStatus`，仅当 `dwRunningState == SPRS_DONE` 才发送 `Finished`。

新 Speak 或 Stop 到来时先把旧 active 结束为 `Interrupted`，再提交新指令或清空队列。不得在调用侧写平台判断，也不得把 COM 接口移出朗读线程。

macOS / Linux 占位实现仍直接返回 `Unsupported`，不产生虚假完成句柄。

## 3. Tauri IPC Channel

`speak` 命令增加请求级 `Channel<TtsEvent>`，事件为：

```rust
#[serde(tag = "type", rename_all = "snake_case")]
enum TtsEvent {
    Started,
    Done,
    Error { message: String },
}
```

命令在引擎受理后发送 `Started`，随后在非 COM 线程等待完成句柄：只有 `Finished` 发送 `Done`；`Interrupted` 正常结束该旧命令但不发送 `Done`；SAPI 状态监测失败发送带消息的 `Error`。完成监听线程无法创建时直接拒绝 invoke，不能留下静默失败。命令不能占用 Tauri 主线程。

feature-gated E2E fixture 为指定文本确定性发送 `Started -> Done`，用于真实 Tauri Channel 与 UI 状态回归；它不调用物理语音引擎，也不进入生产默认路径。

## 4. 前端 store

`src/lib/ipc.ts` 负责构造 `Channel<TtsEvent>` 并把事件交给调用方。`tts-store` 在一次 `speakText` 内捕获当前 generation：

- 调用前：`submitting`；
- 当前 generation 收到 `started`：`speaking`；
- 当前 generation 收到 `done`：`idle` 并清空文本；
- 当前 generation 收到 `error`：进入 `error` 并清空当前文本；
- invoke 拒绝：`error`；
- 旧 generation 的事件或 Promise 完成：忽略。

主动 `stop` 先递增 generation，使旧 Channel 的 `done` 无法覆盖停止后的状态；停止成功回到 `idle`，失败进入 `error`。

翻译页、收藏页不各自增加计时器或 effect。它们继续只消费共享 store，因此一次修复覆盖所有朗读入口。

## 5. 测试与证据边界

- Vitest：用可控 Channel mock 驱动 `started` / `done`，直接断言用户报告的图标状态症状，并覆盖迟到事件。
- Rust：完成句柄与中断语义、状态枚举 serde，以及原有非阻塞/不死锁/线程复用约束。
- app feature + WDIO：feature fixture 经真实 command/Channel 让按钮停止态自动复位。
- Windows 人工：实际听到朗读完成，并观察翻译页和收藏页图标复位。自动化不声称证明扬声器出声。

## 6. 兼容性与回滚

- IPC 是同仓前后端同步变更，无外部兼容承诺；Rust/TS/fixture/注册表同批修改。
- 不改配置、IndexedDB、收藏记录或语音文本。
- 若完成监测异常，可整体回退 Channel 与完成句柄；现有 `stop_speaking` 和常驻线程结构不依赖持久数据。

# Design · Windows 朗读无声修复

## 1. 问题的三个约束交点

修复必须同时满足三条互相拉扯的约束（prd.md R1–R4）：

1. **朗读期间语音实例必须存活** —— 否则声音一发即断（实测 46 字节静音）。
2. **`speak()` 必须立即返回** —— 翻译页读整段译文，阻塞会冻界面（trait 已承诺）。
3. **`Speaker` 必须 `Send + Sync`** —— 工厂返回 `Box<dyn Speaker>`，
   而 `ISpVoice` 是 COM 接口指针，绑定创建它的 apartment，天生不满足。

前两条要求「实例活得比函数调用长」，第三条禁止把它存进 struct。
结论：实例必须活在**另一个线程**上，`speak()` 只是把文本递过去。

## 2. 方案选型

| 方案 | 做法 | 取舍 |
|------|------|------|
| A. 同步等播完 | `speak` 内 `WaitUntilDone` 再返回 | 违反约束 2，界面冻死；直接否 |
| B. 每次 spawn 一个线程 | 线程内建实例、播完再退出 | 满足 1、2、3；但每次朗读一个新实例 → **跨实例 purge 实测无效**，连点两次会重叠（违反 R3），且 `stop` 找不到目标实例（违反 R4）；否 |
| **C. 专用朗读线程 + 消息通道（采纳）** | 进程内单例线程持有唯一实例，`speak`/`stop` 只发消息 | 满足全部约束；单实例故 purge 打断天然生效；`stop` 有明确目标 |

采纳 C。关键洞察：R3/R4 要求「打断」和「停止」跨调用有效，这本身就要求
**全进程只有一个语音实例**；而该实例又不能被 `Speaker` 持有。
唯一出路是把它关在一个线程里，用通道当门缝。

`Sender` 在当前工具链是 `Send + Sync`（已实测编译验证，rustc 1.94.1；
MSRV 1.80，`std::sync::mpsc::Sender: Sync` 自 1.72 起稳定），
所以 `WindowsSpeaker` 可以只持有 `Sender`，`ISpVoice` 从不越过线程边界。

## 3. 结构

```
调用方（Tauri command，任意线程）
  → WindowsSpeaker { tx: Sender<Cmd> }      // Send + Sync，可被 Box<dyn Speaker>
  → tx.send(Cmd::Speak(text)) / send(Cmd::Stop)   // 立即返回，不阻塞
        ↕ mpsc channel
  → 朗读线程（进程内单例，OnceLock 惰性启动）
      · CoInitializeEx(STA) 一次
      · CoCreateInstance(SpVoice) 一次，实例**常驻此线程**
      · 循环收消息：
          Speak(t) → voice.Speak(t, ASYNC | PURGEBEFORESPEAK)
          Stop     → voice.Speak("", ASYNC | PURGEBEFORESPEAK)
```

要点：

- **实例常驻**：线程活着，实例就活着，朗读不再被提前回收（解 R1）。
- **不阻塞**：`send` 是入队操作；线程侧仍用 `SPF_ASYNC`，
  这样线程能立刻回到收消息状态，`Stop` 不会排在长句后面（解 R2、R4）。
- **打断天然生效**：同一实例 + `SPF_PURGEBEFORESPEAK`，
  实测确认后一句丢弃前一句（解 R3）。
- **`ISpVoice` 不跨线程**：它在朗读线程内创建、使用、销毁，
  `Send + Sync` 约束在类型层面依旧成立（`windows.rs` 既有的
  `speaker_is_send_and_sync` 编译期断言测试继续守着）。
- **惰性启动**：线程在首次 `speak`/`stop` 时才起，不朗读的用户不付代价。
  用 `OnceLock<Sender<Cmd>>` 做进程内单例。

## 4. 失败路径

线程侧初始化（COM 或实例创建）失败时，不能静默——`speak()` 必须能返回错误
（`TtsError::Failed`），否则调用方以为成功。

做法：启动线程时用一次性回执通道等初始化结果；初始化成功才把 `Sender` 装进
`OnceLock`，失败则不装并向调用方返回 `Failed`。首次调用因此有一次极短的等待
（仅初始化，不含朗读），后续调用无等待。

初始化失败后不缓存失败状态：下次调用重新尝试启动。理由是失败多为暂态
（音频设备被占用等），把用户永久钉在「不能朗读」不合适。

`send` 失败（线程已死）同样映射为 `TtsError::Failed`，并清理单例以便重启。

空文本仍在进入通道前就拒绝（`TtsError::Empty`），保持既有 4 条测试的行为
（`windows.rs:82` 断言「不触碰 COM」，故校验必须在发消息之前）。

## 5. 契约与兼容性

- `Speaker` trait、`TtsError` 变体、`speaker()` 工厂签名：**零改动**。
- IPC 命令 `speak` / `stop_speaking`：**零改动**（prd.md R5）。
- 前端 `src/`：**零改动**。
- `macos.rs` / `linux.rs` 占位实现：**零改动**（prd.md R6）。
- `Cargo.toml`：预期无需新依赖（通道走 `std`，COM 与 SAPI 的 features 已齐备）。
  若线程模型需要额外 `windows` feature，按 workspace 固定的 `0.61` 添加。

改动面收敛在 `crates/lingostack-tts/src/windows.rs` 单文件。

## 6. 测试策略与其上限

CI 无音频设备，无法断言「真的出声」——这是既有上限
（`.trellis/spec/lingostack-tts/backend/index.md`「测试的天花板」）。
本次能新增的可靠断言：

- 空文本在不触碰 COM 的前提下被拒（既有，保持）。
- `speak` 调用**快速返回**——用耗时上界断言「没有同步等播完」，
  这是 R2 唯一可自动化的证据。
- 连续多次 `speak` 与 `stop` 交替调用不 panic、不死锁，且第二次调用
  仍走同一条通道（验证单例复用，即 R3 的结构前提）。
- `WindowsSpeaker` 的 `Send + Sync` 编译期断言（既有，保持）。
- 朗读线程只被创建一次（单例语义），可用可观测计数或通道身份验证。

**无法自动化、必须手工**：AC1（真的出声）、AC3（连点不重叠听感）、
AC4（停止立即静音）。这三条在 `pnpm tauri dev` 下人工走，结论如实标注。

## 7. 回滚点

单文件改动，回滚即恢复 `windows.rs` 到 `5bfd11c` 版本。
无数据迁移、无配置变更、无前端耦合。

## 8. 文档同步（必须，非可选）

「每次调用新建实例」是当前 spec 明文写入的关键约束，本方案推翻它，
必须同步改写，否则后人会按旧 spec 把改动当 bug 退回：

- `.trellis/spec/lingostack-tts/backend/index.md`：
  「关键约束：不缓存 voice 实例」改写为「voice 常驻朗读线程，
  `Speaker` 只持通道」；「Windows 原生调用约定」的 COM 初始化描述同步；
  「前端接入现状」末节关于 `stop_speaking` 无调用点的记录保留（仍是事实）。
- `crates/lingostack-tts/src/windows.rs:1-6` 模块注释：改写为线程模型说明，
  保留「为什么不能把 `ISpVoice` 存进 struct」这条原始理由——它依然成立，
  且正是选择线程模型的原因。
- `CLAUDE.md` 仓库布局章节：`lingostack-tts` 一行的描述若与新模型不符则更新。

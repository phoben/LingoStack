# 修复朗读自然结束后图标未复位

## Goal

让翻译页、收藏页等所有共享朗读入口准确反映系统语音的真实生命周期：开始播放后显示“停止”，自然播放结束后自动恢复为“喇叭”，无需用户额外点击停止。

## Background and confirmed facts

- 翻译页与收藏页都以 `useTtsStore.status` 和当前文本决定显示喇叭或停止图标。
- 当前 `speak` IPC 成功只表示 Windows SAPI 已受理异步播放；前端随后把状态设为 `speaking`，但后端没有自然结束通知，因此状态只能由用户主动停止或下一次朗读改写。
- Windows 实现必须继续使用常驻专用线程持有 `ISpVoice`，否则异步播放会因实例过早释放而中断；同一实例也是“新朗读打断旧朗读”的前提。
- 当前 `windows` 绑定已提供 `ISpVoice::GetStatus`、`SPVOICESTATUS` 与 `SPRS_DONE`，可在朗读线程内检测自然结束，不需要用文本长度估算播放时长。
- macOS / Linux 仍是明确返回 `Unsupported` 的占位实现，本任务不把它们伪装为可用。

## Requirements

### R1. 自然结束状态同步

- 后端必须以语音引擎的实际完成状态为依据报告自然播放结束。
- 当前朗读自然结束后，共享 TTS 状态回到 `idle`、清空当前文本，所有消费该 store 的页面自动恢复喇叭图标与“朗读”可访问名称。
- 不得使用固定超时、字符数估算或仅在 React 组件内复位的方式模拟完成。

### R2. 打断、停止与并发安全

- 用户主动停止仍应立即清空当前播放状态并恢复喇叭图标。
- 新朗读必须继续打断旧朗读；旧朗读迟到的完成通知不得把新朗读错误复位。
- 快速开始、停止、再开始时，只允许最新一次用户意图更新 store；沿用并扩展请求代次守卫。
- 空文本、Unsupported、引擎初始化失败与运行期失败仍进入可读错误状态，不吞错。

### R3. 跨层与平台边界

- `Speaker` 继续保持对象安全且满足 `Send + Sync`；`ISpVoice` 不得移出其 COM 线程。
- Tauri 命令通过请求级、类型化 Channel 传递“已开始 / 已自然结束”事件；前端仍只通过 `src/lib/ipc.ts` 调业务命令。
- 真实停止或新朗读造成的中断不得伪装成自然结束事件。
- 不改变语音、语速、音量、文本选择或收藏业务。

### R4. 验证

- 先增加能稳定复现“收到自然结束后仍显示停止”的红灯测试，再实施修复。
- store 测试覆盖开始、自然结束、主动停止、旧完成迟到、新朗读替换、错误。
- Rust 测试覆盖完成句柄/事件、常驻线程非阻塞、重复朗读与停止不死锁、单线程复用。
- 真实 IPC/Channel 用 feature-gated E2E fixture 验证；物理音频与 Windows SAPI 完成复位单独进行本机人工验收。

## Acceptance Criteria

- [ ] AC1：翻译页朗读短文本后，播放期间为停止图标；自然播放结束后自动变回喇叭，名称恢复为“朗读”。
- [ ] AC2：收藏页朗读任一词条时行为与翻译页一致；共享状态不会因页面切换丢失或永久停在停止图标。
- [ ] AC3：朗读 A 后立即朗读 B，A 的中断/迟到事件不影响 B；B 自然结束后才回到 idle。
- [ ] AC4：主动停止立即恢复喇叭；停止请求失败显示错误，不伪装成功。
- [ ] AC5：Vitest 对 exact symptom 的回归测试、`lingostack-tts` 测试、app feature 测试及真实 IPC/Channel E2E 通过。
- [ ] AC6：Windows 本机人工观察实际可听朗读自然结束后图标复位；自动化结果不冒充物理出声证据。
- [ ] AC7：`pnpm lint`、`pnpm test`、`pnpm build`、`cargo fmt --all --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test --workspace` 与 `git diff --check` 通过。

## Out of Scope

- 实装或验证 macOS `AVSpeechSynthesizer`、Linux speech-dispatcher。
- 新增语音选择、语速、音量、暂停/继续或播放进度。
- 修改朗读按钮的视觉设计、位置或现有页面布局。
- 自动判断物理扬声器是否真的发声；该结果只由 Windows 人工系统验收提供。

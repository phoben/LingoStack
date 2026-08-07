# Windows 朗读无声修复（issue #2 收尾条）

来源：https://github.com/phoben/LingoStack/issues/2 最后一条
「朗读功能目前点击后无反应，在 windows 下没有朗读声音」。

前置：issue #2 的其余八条已在 `08-07-ui-optimization-issue-2` 完成并合入
（`5bfd11c`）。本任务只收尾这一条缺陷。

## Goal

用户在翻译页点朗读听得到声音；在收藏页点某个词条的朗读同样听得到。
这是 issue #2 九条诉求里唯一未闭环的一条，也是唯一的功能性缺陷（其余八条是体验调整）。

用户价值：朗读能力从「按了没反应」变成可用。

## Background：现状事实（已核查 + 已实测复现）

### 调用链完整，不是接线问题

前端两个入口都已接通、后端命令已注册，全链路无缺口：

- 翻译页原文/译文面板的朗读按钮：`src/components/views/translate-view.tsx:99`
- 收藏页每条词条的朗读按钮：`src/components/views/favorites-view.tsx:187`
- 前端封装：`src/lib/ipc.ts:25`
- 后端命令：`src-tauri/src/commands.rs:24`，已在 `src-tauri/src/lib.rs:45` 注册
- 平台实现：`crates/lingostack-tts/src/windows.rs:45`
- 朗读走自定义 command，无需 ACL 声明（`src-tauri/capabilities/default.json` 描述已确认），
  故不是权限配置缺失

### 根因：异步朗读刚发起就把语音实例释放了

`crates/lingostack-tts/src/windows.rs:45-61` 每次 `speak` 都新建一个 SAPI 语音实例
（`create_voice()`，`:33`），以 `SPF_ASYNC` 提交后**立即从函数返回**。
`voice` 是局部变量，返回即 drop，引用计数归零，朗读随实例一起被销毁。

「每次调用新建实例、不缓存」本身是刻意设计且必须保留——`ISpVoice` 绑定 COM
apartment，不是 `Send + Sync`，而 `Speaker` trait 要求 `Send + Sync`
（`crates/lingostack-tts/src/lib.rs:10`；理由见 `windows.rs:1-6`，
`.trellis/spec/lingostack-tts/backend/index.md` 明确警告不要把 voice 存进 struct）。
缺陷不在「不缓存」，在「异步提交后没有任何机制让实例活到播完」。

**实测证据**（本机 Windows 11 + PowerShell 7，SAPI 录音到 WAV 比对字节数，
探测脚本已删）：

| 场景 | 产出字节 | 结论 |
|------|---------|------|
| 提交后立即释放实例 | 46 | 等于静音，复现「没声音」 |
| 等播完再释放（英文同句） | 190,698 | 同一句话正常出声 |
| 等播完再释放（中文长句） | 354,662 | 中文同样正常 |

语音包不是原因：本机 `Microsoft Huihui Desktop`（zh-CN）与
`Microsoft Zira Desktop`（en-US）均 enabled，默认语音为 Huihui。

### 打断语义的实测边界（影响修复方案选型）

- 同一实例上连续两次 `Speak` 带 `SPF_PURGEBEFORESPEAK`：后一句丢弃前一句
  （实测 66,820 字节 == 单独朗读该短句的字节数），打断生效。
- 不带 purge 则排队播完两句（685,992 字节）。
- 但**跨实例无效**：两个独立实例各自带 purge 互不打断（实测双方均未互相中止）。
  当前实现每次新建实例，所以 `windows.rs:52` 注释声称的「连续点朗读时切换而非排队」
  与 `lib.rs:13-14` 的 trait 契约「打断上一句」**在跨实例场景下不成立**——
  修好发声后，用户连点两次朗读会听到两句重叠。此为同一根因下的连带缺陷，一并修掉。

### 连带缺陷：停止朗读无入口

`stopSpeaking`（`src/lib/ipc.ts:30`）前后端齐备但**前端零调用点**，
`.trellis/spec/lingostack-tts/backend/index.md` 末节已记录此缺口。
**本次不补入口**（用户 2026-08-07 决策：界面一点不动）。
后端 `stop` 仍须随根因一并修正（同样受跨实例失效影响），保持能力正确，
留待将来接入口。

### 失败静默（已知，本次不处理）

朗读失败时前端两处均为 `void speak(...)`，Promise 拒绝无人接手，界面无任何提示；
项目也没有 toast / 通知机制（全站检索 `toast|notify|Notification` 无匹配）。
用户决策为「界面一点不动」，故列入 Out of Scope。

### 平台范围

macOS / Linux 为占位实现，返回 `TtsError::Unsupported` 且各带断言测试
（`crates/lingostack-tts/src/macos.rs`、`linux.rs`）。本任务只动 Windows 分支，
占位实现与其测试保持原状。

## Requirements

R1 Windows 上点朗读能听到完整声音——朗读从发起到播完不被提前中止。
   修复须保留 `Speaker` trait 的 `Send + Sync` 约束与「不把 voice 存进 struct」的
   既有约束（`.trellis/spec/lingostack-tts/backend/index.md` 明令），
   `speaker()` 工厂仍返回 `Box<dyn Speaker>`。

R2 `speak` 仍**立即返回、不阻塞**调用方。翻译页朗读的是整段译文，
   同步等播完会冻结界面；trait 文档也已承诺「调用立即返回」
   （`crates/lingostack-tts/src/lib.rs:13-16`）。

R3 连续点朗读时新内容打断旧内容，不重叠、不排队——兑现 trait 既有契约
   （`lib.rs:12-14`）。跨实例 purge 已实测无效，需另行保证。

R4 `stop()` 能真正停下正在进行的朗读（同受跨实例问题影响）。
   本次不加界面入口，仅保证后端能力正确。

R5 IPC 契约零改动：命令名、参数、返回形状均不变
   （`speak` / `stop_speaking`，`src-tauri/src/commands.rs:24,32`）。
   `src/` 与 `src-tauri/` 均不改。

R6 macOS / Linux 占位实现与其 `Unsupported` 断言测试保持不变。

## Acceptance Criteria

- [ ] AC1（R1）Windows 上翻译页点朗读，听到整段内容读完，不是一声即断；
      收藏页点词条朗读同样出声。
- [ ] AC2（R2）点朗读后界面立即可继续操作（可输入、可切页），无卡顿冻结。
- [ ] AC3（R3）朗读长文本途中再点另一段朗读：旧的立即停、新的开始，不出现两句重叠。
- [ ] AC4（R4）朗读进行中调用停止，声音立即停止。
      前端无入口，此项以 Rust 测试验证。
- [ ] AC5（R1/R2/R3）`crates/lingostack-tts` 新增测试覆盖：朗读发起后语音资源
      在播放期间存活（不被提前回收）、重复朗读的打断行为、停止行为。
      测试不得依赖音频设备实际出声（CI 无音频设备，既有测试已确立此上限，
      见 `.trellis/spec/lingostack-tts/backend/index.md`「测试的天花板」）。
- [ ] AC6（R5/R6）`src/`、`src-tauri/`、`macos.rs`、`linux.rs` 无改动。
- [ ] AC7 门禁全绿：`cargo fmt --all --check`、
      `cargo clippy --all-targets -- -D warnings`、`cargo test --workspace`、
      `pnpm lint`、`pnpm test`、`pnpm build`、
      `cargo tree -p lingostack-core | grep tauri`（应无输出）。
- [ ] AC8 空文本仍拒绝（`TtsError::Empty`），既有 4 条 Windows 测试全绿不退化。

## Technical Notes

- 修复方向见 design.md。任何候选方向须同时满足 R1（活到播完）、R2（不阻塞调用方）、
  R3/R4（打断与停止跨调用有效）与既有 `Send + Sync` 约束。
- 已知约束：`ISpVoice` 非 `Send + Sync`；跨实例 purge 无效；
  workspace 的 tokio 未开 `time` feature（见 memory `lingostack-doc-code-gaps`），
  不要假设有 sleep 可用。
- `windows` crate 已按 `cfg(windows)` 引入，features 含 `Win32_Foundation` /
  `Win32_Media_Speech` / `Win32_System_Com`（`crates/lingostack-tts/Cargo.toml:15-20`）。
  若需新 feature 或新依赖，须在 design.md 说明，并保持版本与 tauri 传递依赖一致
  （workspace 固定 `windows = "0.61"`，`Cargo.toml:55`）。
- 修复会改变「每次调用新建实例」的做法，因此必须同步更新
  `.trellis/spec/lingostack-tts/backend/index.md` 的「关键约束」与
  「Windows 原生调用约定」两节，以及 `windows.rs:1-6` 模块注释。

## Out of Scope

- 不加「停止朗读」界面入口（用户决策：界面一点不动）。
- 不做朗读失败的界面提示（同上；失败静默现状保留）。
- 不加语速 / 音量 / 语音选择等设置项。
- 不实装 macOS / Linux 朗读。
- 不改 IPC 契约、不改前端任何文件。
- 不做按流式增量边读边播。

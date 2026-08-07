# Implement · Windows 朗读无声修复

## 顺序清单

改动集中在 `crates/lingostack-tts/src/windows.rs` 单文件（design.md §5）。

### 块 1 · 朗读线程与通道

- [ ] 1.1 在 `windows.rs` 内定义线程指令类型（朗读 / 停止两种），
      用 `std::sync::mpsc`。
- [ ] 1.2 实现朗读线程入口：线程内 `CoInitializeEx(STA)` 一次 +
      `CoCreateInstance(SpVoice)` 一次，实例常驻；循环收指令，
      朗读与停止都用 `SPF_ASYNC | SPF_PURGEBEFORESPEAK`（design.md §3）。
- [ ] 1.3 实现惰性单例启动：`OnceLock<Sender<...>>` + 一次性回执通道等初始化结果；
      初始化失败不写入 `OnceLock`，返回 `TtsError::Failed`，下次调用可重试
      （design.md §4）。
- [ ] 1.4 `WindowsSpeaker` 改为通过单例通道发消息；`speak` 保持
      「空文本先拒、不触碰 COM」的既有顺序（`windows.rs:82` 测试依赖此顺序）。
- [ ] 1.5 `stop` 改为发停止指令，不再自建实例。

### 块 2 · 测试

- [ ] 2.1 保留既有 4 条测试不改语义：空文本拒绝、speak 不 panic、
      stop 不 panic、`Send + Sync` 编译期断言。
- [ ] 2.2 新增：`speak` 快速返回（耗时上界断言，证明未同步等播完 → R2/AC5）。
- [ ] 2.3 新增：连续 speak / stop 交替调用不 panic 不死锁，通道复用同一线程
      （单例语义 → R3 结构前提）。
- [ ] 2.4 测试收尾都调 `stop`，避免测试期间持续发声（沿用既有做法）。

### 块 3 · 文档同步（design.md §8，必须）

- [ ] 3.1 `.trellis/spec/lingostack-tts/backend/index.md`：改写「关键约束」与
      「Windows 原生调用约定」两节；`stop_speaking` 无调用点的记录保留。
- [ ] 3.2 `crates/lingostack-tts/src/windows.rs:1-6` 模块注释改写为线程模型说明，
      保留「`ISpVoice` 不能存进 struct」的原始理由。
- [ ] 3.3 `CLAUDE.md` 中 `lingostack-tts` 描述若与新模型不符则更新。

### 收尾

- [ ] 4.1 全量门禁（下方命令）。
- [ ] 4.2 确认 `src/`、`src-tauri/`、`macos.rs`、`linux.rs` 零改动（AC6）。
- [ ] 4.3 手工验收 AC1 / AC3 / AC4（`pnpm tauri dev`）：
      翻译页读整段听完 → 长文读到一半点另一段（不重叠）→ 触发停止立即静音。
      AC4 前端无入口，以 Rust 测试或临时调用验证，结论如实标注。

## 验证命令

```bash
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test -p lingostack-tts
cargo test --workspace
cargo tree -p lingostack-core | grep tauri   # 应无输出
pnpm lint
pnpm test
pnpm build
```

`pnpm tauri dev` 用于 AC1 / AC3 / AC4 手工听感验收。

## 风险文件

| 文件 | 风险 | 应对 |
|------|------|------|
| `crates/lingostack-tts/src/windows.rs` | 唯一改动文件，整体重写；线程 + COM + 通道三者叠加，易出死锁或初始化竞态 | 单例只在初始化路径加锁；线程侧全程 `SPF_ASYNC` 不阻塞收消息；新增不死锁测试 |
| `.trellis/spec/lingostack-tts/backend/index.md` | 明文写着「不缓存 voice 实例」，本次推翻该约束 | 必须同步改写（块 3），否则后人按旧 spec 判定本改动为违规 |

## 开始前确认

- 当前分支 `phoben/issue-2-2`，base 为 `main`。
- 提交遵循 Conventional Commits + `Signed-off-by`（DCO 门禁）。
- 本机可实听验证（Windows 11，语音包 Huihui zh-CN / Zira en-US 均可用）。
- macOS / Linux 不在本次范围，占位实现不动。

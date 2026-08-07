# lingostack-tts 开发规范

> 系统朗读。Windows 走 SAPI；macOS / Linux 为占位实现。

路径：`crates/lingostack-tts`（102 + 117 + 48 + 47 行）

## 开发前检查清单

- [ ] **必读** [平台隔离指南](../../guides/platform-isolation-guide.md)
- [ ] 读了 [Rust 通用约定](../../guides/rust-conventions.md)
- [ ] 想缓存 voice 实例？先看下面「不缓存」那节，那会违反 trait 约束
- [ ] 动 macOS / Linux？在结论里标注「需在目标平台验证」

## 结构

| 文件 | 内容 |
|------|------|
| `src/lib.rs` | `TtsError`、`Speaker` trait（`:10-19`）、`#[cfg]` 模块声明与 `speaker()` 工厂（`:35-60`） |
| `src/windows.rs` | SAPI 实现 |
| `src/macos.rs` | 占位。需 `AVSpeechSynthesizer`（经 objc 绑定），见 `:1-7` |
| `src/linux.rs` | 占位。需 speech-dispatcher / `spd-say`，见 `:1-6` |

与 `lingostack-selection` 同构，两个 crate 的 `lib.rs` 可互相参照。

## 关键约束：不缓存 voice 实例

`ISpVoice` 绑定 COM apartment，**不是 `Send + Sync`**，而 `Speaker` trait 要求 `Send + Sync`。所以每次 `speak` / `stop` 都重新 `CoCreateInstance`（`windows.rs:37-41`，理由见 `:1-6`）。

朗读由用户点击触发，这个开销可接受。

**不要为了「优化」把 voice 存进 struct**——会直接编译不过或迫使你放弃 `Send + Sync`，进而破坏工厂函数返回 `Box<dyn Speaker>` 的能力。

`windows.rs:112-116` 有一个 `Send + Sync` 编译期断言测试，值得在同类 crate 里照抄。

## Windows 原生调用约定

- COM 初始化在 `create_voice()` 内**每次调用都做**，忽略返回值（`:37-41`）
- `unsafe` 用逐调用小块，每块上方各自的 `// SAFETY:` 注释（`:56-60`、`:69-73`）——与 `lingostack-selection` 的大块包裹风格不同，两种都可接受
- **错误保留 HRESULT 信息**：`.map_err(|e| TtsError::Failed(format!("...: {e}")))`（`:40,59,72`）
- 无 `CoUninitialize`

## 占位实现

macOS / Linux 返回 `Err(TtsError::Unsupported)`（`macos.rs:27-34`、`linux.rs:26-33`），绝不 panic、绝不静默成功。各带 1 个断言 `Unsupported` 的测试。

实装时删占位测试、补真实测试。

## 测试的天花板

`windows.rs:77-117`：`speak_does_not_panic`（`:91`）无法断言真的出声，只能断言返回 `Ok` 或 `Failed` 变体——CI 环境无音频设备。这是固有上限。

## 质量检查

```bash
cargo clippy --all-targets -- -D warnings
cargo test -p lingostack-tts
```

## 前端接入现状

`speak` 已接通，但 `stop_speaking` 在前端已导出却**无调用点**（`src/lib/ipc.ts:30-32`）——要么补「停止朗读」入口，要么删掉这个导出。

# 跨包思考指南

> 这些指南针对 LingoStack 真实存在的跨边界风险。只在触发条件命中时读，不必通读。

## 本仓库的四条真实断裂线

LingoStack 的 bug 风险不是均匀分布的。以下三处是「改一边、另一边静默失效」的地方，全部有实据：

| 指南                                          | 覆盖的断裂线                                                                         | 何时读                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| [IPC 契约指南](./ipc-contract-guide.md)       | Rust serde 类型 ↔ TS 手写镜像 ↔ IPC 传输。无代码生成、无编译期校验，改名只在运行时炸 | 增删改任何跨 IPC 的字段、枚举变体、命令、事件  |
| [平台隔离指南](./platform-isolation-guide.md) | `lingostack-selection` / `lingostack-tts` 的 Windows 实现 vs macOS/Linux 占位        | 动取词、朗读、热键，或新增任何含平台差异的能力 |
| [Rust 通用约定](./rust-conventions.md)        | 错误类型、内联测试、serde 属性在 7 个 crate 间的一致写法                             | 新增 crate、新增错误变体、写测试               |
| [测试选择指南](./testing-strategy-guide.md)   | 单元/协议/构建/E2E/系统验收与证据等级之间的边界                                      | 修改代码、测试、依赖、构建、CI 或准备交付      |

## 触发清单

### 该读 IPC 契约指南

- [ ] 改了 `crates/lingostack-core/src/config.rs` 里任何 `pub` 字段或枚举变体
- [ ] 新增 / 改名 `#[tauri::command]`
- [ ] 改了 `ChatEvent` 或任何带 `#[serde(tag = ...)]` 的类型
- [ ] 改了 `AppConfig::default()` 或任何 `default_*()` 函数的返回值
- [ ] 动了 Prompt 文本里的 `{source_lang}` / `{target_lang}` / `{style}` 占位符
- [ ] 改了 `index.html` 里的主题预加载脚本，或 `theme-store.ts` 的 storage key

### 该读平台隔离指南

- [ ] 在调用侧写下了 `if cfg!(windows)` 或 `#[cfg(target_os)]` 分支
- [ ] 给 `SelectionProvider` / `Speaker` trait 加了方法
- [ ] 实装 macOS / Linux 占位实现
- [ ] 用到了 `windows` crate、COM、`unsafe`

### 该读 Rust 通用约定

- [ ] 新建 crate，或给现有 crate 加错误变体
- [ ] 拿不准测试放哪、怎么命名
- [ ] 给 serde 类型加字段，不确定用哪套 `#[serde(...)]` 属性

### 该读测试选择指南

- [ ] 要判断这次改动最少跑哪些检查
- [ ] 改了 IPC、Tauri config/capability、Cargo feature 或关键桌面流程
- [ ] 要汇报 CI/平台/系统能力是否真正运行
- [ ] 不确定单元测试、E2E 与手工验收能分别证明什么

## 改值之前先搜

本仓库有多处「同一个值写在两个地方、靠注释同步」的位置（详见 IPC 契约指南）。改任何常量、默认值、字段名之前：

```bash
rg "要改的值" --glob '!target' --glob '!node_modules'
```

这一个习惯能挡掉本仓库最常见的一类缺陷：Rust 侧改了、TS 镜像忘了改，编译全绿，运行时 IPC 反序列化失败。

## 验证 AI 评审结论时

本仓库有大量**刻意为之**的写法，会被评审误判为缺陷。判定前先读代码注释——以下几处都在源码里写明了理由：

1. **三个 provider 大段重复**（`ensure_success`、超时映射、客户端构造）—— 刻意保持每个协议文件自洽可独读，不是漏抽象。
2. **UIA 取词丢弃全部 HRESULT**（`crates/lingostack-selection/src/windows.rs:76-86` 用 `.ok()?`）—— 刻意静默降级到剪贴板，见同文件 63-66 行注释。
3. **配置保存失败不回滚**（`src/stores/config-store.ts:14-16`）—— 刻意只记 error。注意 `favorites-store.ts` 相反，它**会**回滚。
4. **手写 bitfield 而非 bitflags crate**（`crates/lingostack-core/src/hotkey.rs:7`）—— 刻意不引依赖。
5. **`Language::default()` 是 `En`，但配置里 UI 语言默认 `Zh`** —— 刻意分离，见 [IPC 契约指南](./ipc-contract-guide.md)。

**判定规则**：每条评审结论先回到源码验证，尤其先看有没有解释性注释。

## 反过来说，这些是真缺口

不要把它们当成「刻意设计」而放过：

- `LlmError::is_retryable()` / `is_rate_limited()` 由 `lingostack-app` 的 `chat_stream` 消费；自动重试只限零输出，429 使用进程共享冷却，provider 不自行重试。
- 配置文件 0600 权限**只在 Unix 生效**，Windows 分支是空操作（`src-tauri/src/config.rs:59-62`），而该文件存着 API Key。
- 设置加载/保存、提供商表单等异步文本仍未统一 live region；翻译、命名与收藏已有 `aria-live`，不要把局部缺口夸大成全站缺失。
- `favorites-db.ts`、`favorites-store.ts` 与部分 views/ui 原语仍缺直接 Vitest；真实桌面 E2E 只补关键链路，不替代这些单元/组件测试。

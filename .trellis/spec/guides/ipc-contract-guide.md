# IPC 契约指南

> 本仓库最大的单一缺陷来源。Rust 侧类型与前端 TS 镜像**全靠手写同步**，无 `ts-rs` / `specta` / `typeshare`，无运行时 schema 校验。改名两侧都编译通过，只在运行时反序列化失败。

## 契约链路

```
crates/lingostack-core/src/config.rs   (serde 定义，真源)
        ↓ JSON
src-tauri/src/commands.rs              (#[tauri::command] 边界)
        ↓ invoke / Channel
src/lib/config-types.ts                (手写 TS 镜像)
        ↓
src/lib/ipc.ts                         (唯一 invoke 封装)
        ↓
src/stores/*.ts → src/components/...
```

`src/lib/config-types.ts:1-6` 自己写明了这个风险：字段名与大小写必须与 Rust 侧一致，否则 IPC 往返失败。风险已知，但**没有任何机制强制**。

## 大小写映射规则

Tauri 只会 camelCase 化**命令参数名**，不动 struct 字段。所以 TS 镜像里字段名保持 snake_case，这不是疏漏：

| Rust | TS 镜像 | 依据 |
|------|---------|------|
| `#[serde(rename_all = "snake_case")]` 枚举 | snake_case 字符串字面量联合 | `ProviderKind` → `"open_ai_compatible" \| "anthropic" \| "gemini" \| "ollama"`（`config-types.ts:11-15`） |
| struct 字段 | 原样 snake_case | `base_url` / `api_key` 两侧同名（`config.rs:44-49` ↔ `config-types.ts:41-42`） |
| `Language`（例外，用 `lowercase`） | `"zh" \| "en" \| "ja"` | `lang.rs:12` ↔ `config-types.ts:8` |
| `#[serde(tag = "type")]` 标签枚举 | 可辨识联合 | `ChatEvent` → `{type:"chunk";delta:string} \| {type:"status";message:string} \| {type:"done"} \| {type:"error";message:string}`（`commands.rs` ↔ `config-types.ts`） |

**`Language` 用 `lowercase` 而其余枚举用 `snake_case` 是刻意的**（变体都是单词，且对齐 ISO 语言码）。不要「统一」成 snake_case，会破坏磁盘上已有配置的 `"zh"/"en"/"ja"`。

## 改动清单：加一个配置字段

四处都要改，漏一处就是运行时缺陷：

1. `crates/lingostack-core/src/config.rs` — 加字段 + `#[serde(...)]` 属性
2. **同文件的 `impl Default for AppConfig`**（`config.rs:208-222`）— 这是独立于字段属性的第二份默认值清单，没有任何机制强制两者同步
3. `src/lib/config-types.ts` — 加进对应 interface
4. `src/lib/config-types.ts` 的 `defaultConfig()`（`config-types.ts:120-148`）— 第三份默认值清单，手写重实现了 Rust 的默认值

第 2 步和第 4 步最容易漏。`config.rs:355-364` 与 `:385-393` 两个测试确保 Rust 侧两条路径一致（`Default::default()` 与反序列化 `"{}"` 结果相同），**但没有任何测试比对 Rust 默认值与 TS `defaultConfig()`**。

## serde 属性选型

照抄现有写法，不要自创：

- 类型自身可 derive `Default` → 只写 `#[serde(default)]`（`config.rs:176-192` 的 `Vec` / 嵌套 struct / `Theme`）
- 默认值非平凡 → `#[serde(default = "fn_name")]` + 紧跟结构体下方的同名私有函数（`config.rs:196-206`）
- `Option<T>` 且希望缺省时不落盘 → **固定搭配** `#[serde(default, skip_serializing_if = "Option::is_none")]`，两个属性一起写，从不单写后者（`prompt.rs:33-38`，`prompt.rs:85-89` 有测试守护）

## 陷阱：类型默认值 ≠ 配置默认值

`Language::default()` 是 `En`（`lang.rs:16`，测试 `lang.rs:118-120`），但 `AppConfig.ui_language` 走独立的 `default_ui_language()` 返回 `Zh`（`config.rs:196-198`）。刻意如此——产品是中文优先。

**不要**假设 `Language::default()` 反映应用实际默认语言。

## 陷阱：无配置版本号

`AppConfig` 没有 `version` 字段，也没有迁移函数。前向兼容**只靠字段级 serde 默认值**：

- 加可选字段 → 安全，老配置自动填默认值
- **改名或改字段语义 → 无迁移路径**，老配置会静默丢值

真要做破坏性变更，得先引入版本字段和迁移机制，这是目前不存在的能力。

## 陷阱：Prompt 占位符跨语言契约

Prompt 模板文本在 Rust（`include_str!` 编译期嵌入，`prompt.rs:22-28`），**占位符替换在 TypeScript**：

- `src/components/views/translate-view.tsx:101-102` 正则替换 `{source_lang}` / `{target_lang}`
- `src/components/views/naming-view.tsx:55` 替换 `{style}`
- `effective_prompt` 命令原样返回带占位符的字符串（`commands.rs:50` 注释写明由前端替换）

这是隐式字符串协议，两侧无共享常量。Rust 侧测试只保证占位符**存在**（`prompt.rs:141-145`），不保证前端真的替换了。

**不要**在 Rust 侧加模板引擎「修复」这个分工——会与前端替换重复。改占位符名必须同步改前端正则。

## 陷阱：主题 storage key 双写

`lingostack.theme` 这个字符串写在两处：

- `src/index.html:9,12` — React 挂载前的同步内联脚本，防主题闪烁
- `src/stores/theme-store.ts:10` — `THEME_STORAGE_KEY`

`index.html:8-9` 注释要求两者保持一致。靠注释，非类型。

## IPC 错误一律是字符串

7 个命令全部返回 `Result<T, String>`，Rust 错误在边界处 `.to_string()` 拍平（`commands.rs` 各命令）。前端无法按错误种类分支，只能展示文本。`ChatEvent::Error{message}` 同理。

这是有意的规模取舍，不是疏漏。前端每个调用点各自用 `typeof e === "string" ? e : String(e)` 归一（`config-store.ts:51`、`translate-view.tsx:122`、`naming-view.tsx:75` 重复三遍）——**新增调用点时优先抽公用函数到 `src/lib/`，别抄第四遍**。

## 流式与广播是两套原语

别混用：

- **请求作用域流式** → `tauri::ipc::Channel<ChatEvent>`（`commands.rs:6,75`）。前端 `new Channel()` 后赋 `onmessage`（`ipc.ts:55-63`），无显式退订，`invoke` 结束即回收。
- **全局广播** → `AppHandle::emit()`。事件名 `"hotkey-status"`（`hotkeys.rs:28`）、`"translate-selection"`（`hotkeys.rs:129`）。前端用 `listen()` 且**必须退订**（`App.tsx:47-49` 返回清理函数）。

## 提交前自检

```bash
cargo test --workspace          # Rust 侧 serde 往返 + 默认值一致性
pnpm build                      # tsc --noEmit，抓 TS 镜像自身的类型错误（抓不到与 Rust 的不一致）
pnpm tauri dev                  # 唯一能真正验证 IPC 往返的手段
```

`pnpm build` 通过**不代表**契约对齐。跨 IPC 的字段改动必须实际跑一次 `pnpm tauri dev` 验证往返。

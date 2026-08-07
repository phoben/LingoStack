# 配置模型

`src/config.rs`。这是全仓库最容易改错的文件——它同时被前端手写镜像、磁盘上的用户配置、以及两条默认值路径约束。

## 加字段的完整动作

**四处**，漏一处就是运行时缺陷（跨 IPC 部分详见 [IPC 契约指南](../../guides/ipc-contract-guide.md)）：

1. 结构体字段 + `#[serde(...)]` 属性
2. `impl Default for AppConfig`（`config.rs:208-222`）—— 独立的第二份清单
3. `src/lib/config-types.ts` 对应 interface
4. `src/lib/config-types.ts` 的 `defaultConfig()`

第 1、2 步的一致性由测试守护：`default_config_has_sensible_values`（`:355-364`）与 `missing_fields_fill_defaults_on_deserialize`（`:385-393`）断言同一批值。**但没有任何机制**在漏了第 2 步时报错——新字段只会静默拿到 `Default` 的零值。加字段时把这两个测试都补上断言。

## serde 属性选型

三种情况，照抄现有写法：

```rust
// 类型自身可 derive Default
#[serde(default)]
pub providers: Vec<ProviderConfig>,          // :176

// 默认值非平凡 → 命名函数，紧跟结构体下方定义
#[serde(default = "default_ui_language")]
pub ui_language: Language,                    // :180 → fn 在 :196-198

// 默认值来自其他模块的公共 API → 直接指全路径
#[serde(default = "crate::hotkey::defaults")]
pub hotkeys: Vec<HotkeyBinding>,              // :188

// Option 且缺省不落盘 → 两个属性固定搭配，从不单写后者
#[serde(default, skip_serializing_if = "Option::is_none")]
pub translate: Option<String>,                // prompt.rs:34
```

同一批默认值函数同时被 serde 属性和 `impl Default` 调用——默认**值**不重复，重复的是**接线**。

## 枚举大小写

面向 JSON 持久化的枚举一律 `#[serde(rename_all = "snake_case")]`：`ProviderKind`（`:19`）、`Feature`（`:112`）、`Theme`（`:165`）、`HotkeyAction`（`hotkey.rs:59`）、`NamingStyle`（`naming.rs:9`）。

**唯一例外**：`Language` 用 `lowercase`（`lang.rs:12`），因为变体都是单词且对齐 ISO 语言码。不要「统一」它，会破坏磁盘上已有的 `"zh"/"en"/"ja"`。

## 密钥脱敏

`ProviderConfig` **刻意不 derive `Debug`**（`:36-50` 只有 `Clone, Serialize, Deserialize`），改为手写 impl 把 `api_key` 换成 `"<redacted>"`（`:52-63`）。这是全 crate 唯一的手写 trait impl。

另有 `redact()` 返回 `RedactedProvider<'a>` 视图，用 `mask_secret()` 做部分掩码——保留首尾各 2 字符，≤8 字符则全掩（`:66-101`）。掩码位数算法有测试（`:271-279`，含解释注释）。

**给 `ProviderConfig` 加字段时**：如果新字段含敏感信息，必须同步更新手写 `Debug` impl 和 `redact()`。derive 宏不会帮你。

## 模型解析

`resolve_model(feature)` 的优先级：功能级默认模型 → 全局兜底 → `ResolveError::Unassigned`。引用了不存在的 `provider_id` 则 `UnknownProvider`（`:137-145`、`:149`、`:235`）。

`ResolveError` derive 了 `PartialEq, Eq`，所以测试直接 `assert_eq!` 比对（`:326-331`）；需要只校验形状时用 `matches!`（`:352`）。

## 无版本号、无迁移

没有 `version` 字段，没有迁移函数。前向兼容只靠字段级 serde 默认值：

- 加可选字段 → 安全
- **改名 / 改语义 → 老配置静默丢值，无迁移路径**

真需要破坏性变更，先补版本字段和迁移机制。这是当前不存在的能力，别假设它在。

## 陷阱：类型默认值 ≠ 配置默认值

`Language::default()` 是 `En`（`lang.rs:16`），但 `ui_language` 和 `global_default_target` 都走独立函数返回 `Zh`（`:196-202`）。刻意如此——产品中文优先。别用 `Language::default()` 推断应用默认语言。

## 陷阱：Modifiers 是手写位域

`Modifiers` 是 `u8` newtype，没用 `bitflags` crate（理由见 `hotkey.rs:7`：避免为一个位域引依赖）。序列化成纯数字以求稳定（`hotkey.rs:10`），可读性次要。

前端镜像了这套位常量（`config-types.ts:112-117`）——改位值要同步。

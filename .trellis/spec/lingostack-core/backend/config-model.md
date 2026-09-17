# 配置模型

`src/config.rs`。这是全仓库最容易改错的文件——它同时被前端手写镜像、磁盘上的 schema v2 用户配置、共享 IPC fixture 与请求解析策略约束。

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

// 类型自己的 Default 就是应用缺省值
#[serde(default)]
pub ui_language: UiLanguage,

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

## 提供商、模型与请求解析

`ProviderPreset` 只负责创建起点；持久化事实来源是 `ProviderInstance`。实例必须显式保存 `protocol`、`auth`、`base_url`、模型描述和可选参数 profile，运行时不得反查 catalog 覆盖这些字段。

`resolve_model(feature)` 的优先级：功能级默认模型 → 全局兜底 → `ResolveError::Unassigned`。`resolve_request(feature)` 在此基础上继续校验 provider/model/feature/参数，并返回协议适配层可直接消费的封闭式 generation 设置。

参数 profile 与实例的协议、端点 scope 同时匹配时才生效；用户把端点改出审核范围后，实例仍可调用，但温度、最大输出与 reasoning 全部保守省略。OpenAI Responses 例外：schema v2 只允许官方 `openai-responses` 预设和 `https://api.openai.com`。

`Feature::DocTranslate` 使用同一条 `ModelAssignment::resolve` 分支：`models.doc_translate` 为空时必须回退 `models.global_default`，不得由文档功能另建第二套模型配置或解析规则。

`ResolveError` derive 了 `PartialEq, Eq`，所以测试直接 `assert_eq!` 比对（`:326-331`）；需要只校验形状时用 `matches!`（`:352`）。

## UI 语言与翻译语言分离

`UiLanguage` 只允许 `system | zh | en`，默认 `system`；它控制界面文案，不等同于可翻译语种 `Language`（后者仍支持 `zh | en | ja`）。

当 UI 语言为 `system` 时，浏览器端用 `navigator.language` 解析当前界面语言，并把结果传给 `translation_plan`。core 的 `translation_language()` 对显式 `zh/en` 直接返回，对 `system` 使用前端传值；未传时回退 `en`，避免把开发者机器语言硬编码进纯 core。

## schema v2 与不兼容边界

`AppConfig.schema_version` 是必填字段，当前常量为 v2。Issue 24 明确不迁移旧 provider JSON：缺失版本或非 v2 都必须给出“重新配置 AI 提供商”的可操作错误，不能靠 serde 默认值静默解释。

schema v2 内部仍允许边界明确的非 provider 局部迁移：

- v2 内加可选字段 → 安全，但必须同步 Rust、TypeScript、默认值与 `fixtures/ipc-contract.json`
- `translate_popup` 通过 `HotkeyAction::TranslateSelection` 的 serde alias 读取，写回统一为 `translate_selection`
- 旧 `ui_language: "ja"` 通过别名迁移为英文 UI
- `AppConfig::normalize_hotkeys()` 按动作去重；load/save 边界均调用，保证旧配置最终收敛

除上述已测的局部兼容外，provider 字段改名或语义变化必须提升 schema 版本并先明确迁移策略；不得给必填版本加 serde 默认值。

## Scenario: schema v2 提供商请求解析

### 1. Scope / Trigger

- 修改 provider、model、功能分配、generation 字段，或新增预设/协议时适用。

### 2. Signatures

```rust
pub fn validate(&self) -> Result<(), ConfigValidationError>;
pub fn resolve_request(&self, feature: Feature) -> Result<ResolvedRequest<'_>, ResolveError>;
pub fn instantiate_preset(preset_id: &str) -> Option<ProviderInstance>;
pub fn discovery_profile_for(provider: &ProviderInstance) -> Option<DiscoveryProfile>;
```

### 3. Contracts

- JSON 字段保持 snake_case；`schema_version = 2` 必填。
- 模型规格的 context/max 分别携带 `ValueSource`；模型条目携带 `ModelOrigin`。
- discovery 只在 preset/protocol/endpoint 精确匹配时开放；返回值只供 UI 选择，不能直接落盘。
- discovered merge 按模型 ID 合并，不删除旧模型，不覆盖 bundled/user 值。
- generation 只有 temperature、max output、reasoning 三个封闭字段，禁止任意参数字典。

### 4. Validation & Error Matrix

| 条件 | 结果 |
|---|---|
| schema 缺失或不是 v2 | load/save 拒绝并提示重新配置 |
| provider/model ID 重复或必填字段为空 | `ConfigValidationError` |
| 模型不支持目标功能 | `FeatureUnsupported` |
| 参数超范围或超过已知模型上限 | `ParameterInvalid` |
| 参数能力/协议映射不支持 | `ParameterUnsupported` |
| profile scope 失配 | 请求仍可执行，但 optional generation 全部省略 |
| Responses 非官方预设或端点 | 保存和请求均拒绝 |

### 5. Good / Base / Bad Cases

- Good：从预设复制实例后任意编辑名称/key；后续 catalog 更新不改变已保存实例。
- Base：手工模型默认可用于文本功能并标记 `user_entered`，规格未知可留空。
- Bad：根据 `preset_id` 在运行时重建实例，或把发现到的 ID 当成能力/规格证明。

### 6. Tests Required

- serde 往返、缺失/旧 schema、Debug 脱敏、重复 ID、auth/protocol 组合。
- catalog ID 唯一、自定义不属于预设、实例独立、发现精确匹配。
- 非破坏性 merge、功能能力、参数范围/profile scope、Responses 官方边界。
- Rust 默认配置必须与共享 IPC fixture 一致。

### 7. Wrong vs Correct

```rust
// Wrong：端点已改成未知代理，仍沿用预设字段映射。
request.max_output_tokens = model_ref.generation.max_output_tokens;

// Correct：只有 protocol + endpoint scope 都匹配时才保留可选参数。
let resolved = config.resolve_request(feature)?;
```

## 陷阱：类型默认值 ≠ 配置默认值

`Language::default()` 是 `En`（`lang.rs:16`），`UiLanguage::default()` 是 `System`，而 `global_default_target` 走独立函数返回 `Zh`。别用翻译语种的默认值推断 UI 语言或应用目标语种。

## 陷阱：Modifiers 是手写位域

`Modifiers` 是 `u8` newtype，没用 `bitflags` crate（理由见 `hotkey.rs:7`：避免为一个位域引依赖）。序列化成纯数字以求稳定（`hotkey.rs:10`），可读性次要。

前端镜像了这套位常量（`config-types.ts:112-117`）——改位值要同步。

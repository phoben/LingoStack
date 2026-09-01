# Prompt 模板

`src/prompt.rs` + `src/prompts/{translate,naming,explain}.txt`。这是产品差异化的核心资产，改动纪律最严。

## 加载机制

文本外置为 `.txt`，编译期用 `include_str!` 嵌入（`prompt.rs:22-28`）：

```rust
pub const TRANSLATE_PROMPT: &str = include_str!("prompts/translate.txt");
pub const NAMING_PROMPT: &str = include_str!("prompts/naming.txt");
pub const EXPLAIN_PROMPT: &str = include_str!("prompts/explain.txt");
```

不是运行时文件读取——所以改了 `.txt` 必须重新编译才生效。

## 用户覆盖

`PromptOverrides` 三个 `Option<String>` 字段，访问器实现「自定义优先，留空回退内置」（`prompt.rs:44-58`）：

```rust
self.translate.as_deref().unwrap_or(TRANSLATE_PROMPT)
```

每个功能一个方法，都带 `#[must_use]`。字段用 `#[serde(default, skip_serializing_if = "Option::is_none")]`，全 `None` 时序列化成 `{}`（测试 `prompt.rs:85-89`）。

## 「快照测试」的真实机制

**没有用 `insta`，没有 `.snap` 文件。** 理由写在 `prompt.rs:8-17`：因为 Prompt 文本独立成 `.txt` 文件，`git diff` 本身就逐行展示改动——**文件即快照**。

Rust 侧测试断言的是**内容不变量**，不是字面相等：

- `translate_prompt_encodes_dev_language_rules`（`:91-101`）：必须含「原样保留」或「保留原文」、含「禁止意译」、含 `Redis`（技术名词不直译的探针）、含 `{target_lang}`
- `:103-106`：`NAMING_PROMPT` 必须含 `{style}`
- `:108-113`：`EXPLAIN_PROMPT` 必须含 `{target_lang}` 与「程序员」
- `all_prompts_are_structurally_sound`（`:116-138`）：表驱动，三个 Prompt 各须长度 > 80、≥5 行、以 `\n` 结尾、**不含 `TODO` / `FIXME`**
- `:141-145`：`TRANSLATE_PROMPT` 必须同时含 `{source_lang}` 和 `{target_lang}`（防只删一个导致字面占位符发给模型）

**这些是语义探针，不是全文校验**。一次「保留所有关键词但重写其余全部」的改动能通过测试。所以：

> 改 Prompt 文本的 PR，必须在描述里说明**为什么**改。风格回归很难在事后察觉——这是流程约束，测试挡不住。

改了 `.txt` 后同步检查上述断言是否仍然成立；新增 Prompt 要一并加进 `:116-138` 的表。

## 占位符与术语解释语言是跨层契约

翻译 Prompt 的语言替换与不可覆盖术语协议统一在 Rust 完成：

```rust
compose_translation_prompt(base, explanation_language)
effective_translation_prompt(source, target, explanation_language, state)
```

- `effective_translation_prompt` 先替换 `{source_lang}` / `{target_lang}`，再通过 `compose_translation_prompt` 追加机器协议。
- `explanation_language` 只控制术语 `explanation` 的语言，必须传当前界面语言解析后的 `zh` / `en`，不得复用原文语言或目标语言。
- 前端 IPC 参数名固定为 camelCase `explanationLanguage`；自定义翻译 Prompt 也不能覆盖这条解释语言约束。
- `{style}` 仍由命名视图替换；通用 `effective_prompt` 仍可返回原始模板，但翻译业务不得绕过专用命令自行拼协议。

测试必须同时覆盖内置和自定义翻译 Prompt，并分别断言中文/英文界面得到对应的解释语言；IPC 测试还要断言参数使用 `explanationLanguage`，避免 Tauri 运行期缺参。

## 内容规范

Prompt 内容须遵循开发行业语言习惯（设计文档要求）：

- 避让产品名、变量名、命令名、技术名词
- 避免直译（不把 `Redis` 译成「远程字典服务」）——`Redis` 作为探针词已写进测试
- 解释类 Prompt 面向程序员表述（「程序员」一词已写进测试）

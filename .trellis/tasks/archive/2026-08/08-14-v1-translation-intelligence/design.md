# 技术设计：智能翻译契约与可靠性

## Contract

应用层定义 `TranslationTerm { term, category, explanation }` 与增量解析状态。模型输出为译文正文、独立完整 sentinel 行 `<<<LINGOSTACK_TERMS_V1>>>`、紧随其后的 JSON 数组。协议组装属于 core 的纯逻辑；provider 仍只传递普通文本 chunk，不增加协议特化。

解析器保留不超过 sentinel 长度的候选尾缓冲，只有确认字符不可能属于 sentinel 时才刷入译文；命中后转入 metadata 缓冲。完成时校验 JSON：数组、0–5、字段非空、category 枚举合法、term 存在于原文/译文、case-insensitive 去重。无效元数据不改变译文成功态。

固定协议说明与用户 Prompt 分开组合。协议说明要求：只抽专业实体、普通词省略、解释使用 source language、最多 5 项、无词条返回 `[]`。`Explain` 配置字段/Feature 仅做旧配置兼容，UI 不暴露独立模型选择。

语言解析继续调用 `lingostack-core::lang`。Tauri 提供类型化 planning IPC，输入文本与可选 source/target override，输出 source/target；前端不复制探测算法。

重试驱动位于 Tauri 应用层：记录是否已发送 chunk；只在零输出且 `is_retryable()` 时 sleep 后重建 provider stream 一次。429 设置共享冷却状态并发送可理解状态；不修改三个 provider 的自洽实现。

## Compatibility

- 新增 IPC 类型同步 Rust serde 与 TS 镜像。
- 保留旧配置可反序列化；不把 Explain 旧字段用于新请求。
- 纯文本旧/异常模型响应按“无 sentinel = 全部译文、无 tag”兼容。

## Tests

- Rust：Prompt 协议不变量、语言 plan、重试策略纯逻辑。
- TypeScript：incremental parser 全分片矩阵、term 验证、命名 5 条边界。
- wiremock：OpenAI/Anthropic/Gemini 归一化后均能传输同一信封；不依赖 provider chunk 边界。
- RTL：译文流、tag hover/focus、协议失败降级、错误重试。

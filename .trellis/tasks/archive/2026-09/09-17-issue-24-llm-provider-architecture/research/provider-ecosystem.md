# Issue #24 一手资料补充与差异清单：提供商生态

> 范围：对 `docs/research/issue-24-llm-provider-architecture.md` 作补充/核对，不复述其已成立的架构建议。仅采用厂商官方 API 文档与 CC Switch 官方资料。访问日期均为 2026-09-17。

## 总结

既有文档“预设、协议、模型能力三层分离；静态审核 catalog + 可编辑实例 + 尽力发现”的主结论没有发现需要推翻的部分。以下是实施前应补入的认证、发现和能力事实，以及两处需修正的表述：**DeepSeek 已有官方 `GET /models`，不应被归为只能文档确认的品牌；Ollama 原生 API 的流式不是 Chat SSE，而是逐行 JSON，不能用名称暗示其必然 OpenAI 兼容。**

## 关键补充（可直接影响协议适配）

| 主题 | 一手事实与差异 | 对 Issue #24 的影响 | 来源 |
| --- | --- | --- | --- |
| OpenAI Chat / Responses | Chat 为 `POST /chat/completions`、以 `messages` 为输入；Responses 是独立的 `POST /responses` 资源，事件流具名而非 Chat chunk。OpenAI 的模型列表为 `GET /v1/models`，只承诺当前可用模型的基础对象，不能作为窗口/参数能力表。API Key 使用 `Authorization: Bearer ...`。 | 保持两个适配器和两组 SSE fixture；发现结果只补 ID/显示名，不能覆盖 catalog 能力。 | [Chat 参考](https://developers.openai.com/api/reference/resources/chat)；[Models 参考](https://platform.openai.com/docs/api-reference/models/list)；[认证](https://platform.openai.com/docs/api-reference/authentication) |
| Anthropic Messages | 认证除了 `x-api-key`，还必须带版本头 `anthropic-version`；Messages 的 `max_tokens` 必填。`GET /v1/models` 是分页列表（`before_id`、`after_id`、`limit`），而不是模型能力目录。流式事件含 `message_start`、`content_block_delta`、`message_stop`。 | 当前协议配置/请求构造必须把版本头作为协议固定元数据；发现器需要处理 cursor，而不是只抓一页。 | [Messages](https://platform.claude.com/docs/en/api/messages)；[Models 列表](https://platform.claude.com/docs/en/api/models/list)；[流式](https://platform.claude.com/docs/en/api/messages-streaming) |
| Gemini Generate Content | `GET /v1beta/models` 返回每个模型的 `supportedGenerationMethods`、`inputTokenLimit`、`outputTokenLimit`，并包含 `temperature`、`topP`、`topK` 等生成默认值/上限字段；调用须以 `x-goog-api-key` 认证。`streamGenerateContent?alt=sse` 与普通 `generateContent` 共享请求形状。 | 是首期最强的动态能力来源，但须用 `supportedGenerationMethods` 过滤，而非将列表中全部模型视为可聊天；保存来源与抓取时间。 | [Models](https://ai.google.dev/api/models)；[Generate Content](https://ai.google.dev/api/generate-content)；[认证与端点](https://ai.google.dev/api) |
| DeepSeek（纠正） | 官方现在明确有 `GET /models`，返回 OpenAI 风格的 `id/object/owned_by`；官方同时说明 OpenAI base URL 为 `https://api.deepseek.com`、Anthropic base URL 为 `https://api.deepseek.com/anthropic`。Chat 流为 data-only SSE，以 `[DONE]` 结束；Responses 有单独官方文档。 | 将既有“只在正式文档确认后接入”的泛化边界改成：DeepSeek 可列入 OpenAI 风格 ID 发现；但返回没有窗口、最大输出或思考能力，仍不能替代静态 catalog。Responses/Anthropic 仍应各自 mock 后才开放。 | [快速开始与协议](https://api-docs.deepseek.com/)；[模型列表](https://api-docs.deepseek.com/api/list-models/)；[Chat 流](https://api-docs.deepseek.com/api/create-chat-completion/)；[Responses](https://api-docs.deepseek.com/guides/responses_api/) |
| MiniMax | 官方 OpenAI 兼容文档提供 `GET /v1/models`，国际站 Base URL 为 `https://api.minimax.io/v1`。 | “品牌不绑死协议”的既有建议成立；首期选择 OpenAI Chat + 发现。其他协议只有在各自请求与流式 fixture 成立后才能作为另一预设开放。 | [官方模型列表](https://platform.minimax.io/docs/api-reference/models/openai/list-models)；[官方文本生成指南](https://platform.minimax.io/docs/guides/text-generation) |
| 阿里百炼 / 通义 | 官方 `GET /api/v1/models` 可按能力过滤，并返回定价、上下文长度等；认证为 `Authorization: Bearer {API_KEY}`。其 OpenAI 兼容 URL 与 Key 均受地域/工作空间约束；官方也明确其文本模型有 Chat、Responses、Anthropic 与原生 DashScope 多种接口。 | 既有 URL 模板建议成立；可以把官方模型列表作为受来源的能力发现候选，但需将地域/workspace 作为发现请求上下文，不能跨地域缓存或混用 Key。 | [查询模型列表](https://help.aliyun.com/zh/model-studio/list-models)；[协议总览](https://help.aliyun.com/zh/model-studio/qwen-api-reference)；[OpenAI Chat 兼容](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope) |
| Ollama（纠正/补充） | 官方原生 API 是 `POST /api/chat`；默认返回逐行 JSON 流，设置 `stream:false` 才是单个 JSON 对象。`GET /api/tags` 仅列出本机已安装模型及其本地细节，不是云端 catalog。Ollama 另有 OpenAI compatibility 文档，但二者不能混称为同一种流。 | 若当前 Rust 适配器使用 `/api/chat`，协议标识应是 `ollama_native`（或明确的 native transport），其解析 fixture 不可复用 OpenAI SSE；若另增 `/v1/chat/completions` 才新增 `ollama_openai_compatible`。本地列表可用于可选模型选择，但不能填充完整能力。 | [Chat API](https://docs.ollama.com/api/chat)；[本地模型列表](https://docs.ollama.com/api/tags)；[OpenAI compatibility](https://docs.ollama.com/openai) |

## 关于“模型能力必须带来源”的进一步证据

1. 不同官方发现接口提供的信息并不等价：OpenAI/DeepSeek 的 `/models` 主要给 ID 和归属；Anthropic 的列表也只描述模型对象与分页；Gemini、百炼才直接给出部分 token limit/生成能力。这直接支持既有文档的“不能以远端 `/models` 的不完整返回取代人工核验目录”。
2. 请求参数命名和约束也由协议与模型共同决定：Anthropic 的 `max_tokens` 是必填；OpenAI Responses 使用 `max_output_tokens`；Gemini 在模型对象公开 generation 参数范围；DeepSeek Chat 在 `stream:true` 下才允许 `stream_options`。因此 `temperature`、最大输出和思考深度不能设计成不带来源、无协议边界的全局开关。
3. 推荐让每个静态 `ModelDescriptor` 至少记录 `source_url`、`verified_at`、精确 `model_id`/版本或版本选择规则，并分别记录 `context_window`、`max_output_tokens`、`parameter_support` 的证据；动态发现只可新增/更新“此 Key 当前可见的 ID”，除非该响应本身含相应字段（Gemini、百炼）。这是对既有数据形状的最小补强，不要求引入远端 catalog 或代理。

## CC Switch：只补充取舍证据

CC Switch 的官方快速开始确认“预设自动填 endpoint、用户再填 API Key”，且未命中预设时走 Custom；官方仓库说明各客户端具有专用 provider preset/config 管理。这个交互可借鉴为 LingoStack 的“预设实例化为可编辑本地实例 + 自定义一等入口”。

但其 Universal Provider 会向多个 CLI 同步配置，且手工 Sync 会覆盖已链接的各应用配置；这是跨客户端配置控制面，和 LingoStack 单桌面翻译应用的 BYOK 配置目标不同。故不应照搬 Universal Provider、代理接管、故障转移、SQLite 备份/同步或跨应用写入。

- [CC Switch 快速开始](https://cc-switch.dev/docs/getting-started/quick-start/)
- [CC Switch 官方仓库](https://github.com/farion1231/cc-switch)
- [CC Switch Universal Provider 说明](https://github.com/farion1231/cc-switch-website/blob/main/public/docs/en/2-providers/2.1-add.md)

## 尚缺一手证据 / 不应在本轮变成事实

| 条目 | 结论 |
| --- | --- |
| 智谱 GLM 的 `GET /models` | 既有文档已足以支持 OpenAI Chat 预设；本次未找到可稳定复核的智谱官方模型发现 API 文档。因此不要在发现器承诺中把智谱列为已核验，除非实现前补到直接官方契约。 |
| 智谱/DeepSeek/MiniMax 的窗口、最大输出、思考深度 | 各品牌的 `/models`（若有）不天然给全量能力。具体模型版本、套餐和区域会变化；catalog 条目必须逐模型链接官方规格，而不是从品牌预设继承。 |
| Kimi、火山方舟 | 本文不增加预设。既有“待可重复 mock 合约后再加入”的边界仍合适。 |
| CC Switch 的“九种工具” | 当前官方仓库/官方快速开始的公开叙述与既有文档中的数量可能随版本变化，且不是 LingoStack 架构决策依据。实施文档可删除精确数量，改写为“多个 CLI 的配置中枢”，避免无关的时效性断言。 |

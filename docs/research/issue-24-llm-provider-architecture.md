# Issue #24：LLM 提供商、模型发现与调用能力的轻量架构调研

> 调研日期：2026-09-17。本文只引用厂商官方 API 文档与开源项目官方仓库；模型名称、限额和端点会演进，预设上线前仍须复核链接。本文是架构调研，不授权实施。

## 结论先行

推荐在现有四个协议适配（`open_ai_compatible`、`anthropic`、`gemini`、`ollama`）之上，新增**静态、随应用发布的预设目录**和按协议实现的**尽力模型发现**；不要引入本地代理、数据库、云同步或协议转换服务。

配置、代码和产品概念应严格分成三层：

| 层 | 负责的问题 | 例子 | 不负责的问题 |
| --- | --- | --- | --- |
| Provider 品牌/预设 | 给用户可信的起点 | DeepSeek、智谱、OpenAI；显示名、官方文档、建议 Base URL、认证方式 | 决定请求 JSON 或假定每个模型能力相同 |
| Protocol 协议 | 怎样发请求、怎样解析流 | OpenAI Chat、OpenAI Responses、Anthropic Messages、Gemini Generate Content | 绑定品牌或硬编码模型名单 |
| Model capability | 某个模型可被哪个功能选用及可选参数 | text、vision、stream、reasoning、context window、max output | 以远端 `/models` 的不完整返回取代人工核验数据 |

这与当前实现相容：`ProviderConfig` 目前已经把用户实例的 `id`、`kind`、`name`、`base_url`、`api_key`、`models` 分开，`LlmProvider` 只暴露流式聊天；但 `ProviderKind` 尚未区分 OpenAI Chat 与 Responses，`ChatRequest` 也只有 `temperature`。见仓库当前的 [`config.rs`](../../crates/lingostack-core/src/config.rs) 与 [`lib.rs`](../../crates/lingostack-llm/src/lib.rs)。

## 原生 API 核对

| API | 模型发现 | 文本调用/流式 | 对 LingoStack 的含义 |
| --- | --- | --- | --- |
| OpenAI Chat Completions | `GET /v1/models` 仅提供基础模型对象（ID、owner 等） | `POST /v1/chat/completions`；`stream=true` 产生 Chat chunk SSE | 现有 `OpenAiProvider` 的形状可继续覆盖此协议；新模型的参数支持会不同，不能全局发送旧 `max_tokens`。[官方 Models](https://platform.openai.com/docs/api-reference/models/list)、[Chat](https://platform.openai.com/docs/api-reference/chat/create) |
| OpenAI Responses | 同样可用 `GET /v1/models`，但列表不等于“可用 Responses 功能表” | `POST /v1/responses`；`stream=true` 产生具语义事件的 SSE，例如文本增量和完成/失败事件 | 这是**新协议适配器**，不是把 Chat URL 改成 `/responses`：请求使用 `input`/`instructions`，最大输出为 `max_output_tokens`，并支持如 `reasoning.effort` 的模型相关能力。[官方 Responses](https://platform.openai.com/docs/api-reference/responses/create)、[流事件](https://platform.openai.com/docs/api-reference/responses-streaming) |
| Anthropic Messages | `GET /v1/models`，支持 `before_id`、`after_id`、`limit` 分页 | `POST /v1/messages`；`stream=true` 为 SSE，含 `message_start`、`content_block_delta`、`message_stop` 等 | 现有适配器保留。`max_tokens` 是该协议请求必填项；扩展思考为 `thinking`，且与采样参数组合有约束，不能以“全模型通用开关”暴露。[官方 Models](https://docs.anthropic.com/en/api/models-list)、[Messages](https://docs.anthropic.com/en/api/messages)、[流式](https://docs.anthropic.com/en/api/messages-streaming) |
| Gemini Generate Content | `GET /v1beta/models`；返回 `supportedGenerationMethods`、`inputTokenLimit`、`outputTokenLimit` 等，可筛选支持 `generateContent` 的模型 | `POST /v1beta/models/{model}:generateContent`；`:streamGenerateContent?alt=sse` 为流式 | 此列表是首期最适合填充能力元数据的官方发现接口；请求主体仍是 `contents`、`systemInstruction`、`generationConfig`，不是 Chat/Responses。思考参数依模型而异。[官方 Models](https://ai.google.dev/api/models#method:-models.list)、[Generate Content](https://ai.google.dev/api/generate-content)、[Thinking](https://ai.google.dev/gemini-api/docs/thinking) |

**模型发现的边界。** 提供一个可选的 `discover_models` 能力，而不是假定所有协议都有 `GET /models`：OpenAI、Anthropic、Gemini 与 MiniMax 有官方列表接口，其他提供商只能由其正式文档确认后接入。发现失败、分页失败、权限不足和空结果必须让用户继续手工填写模型；不应阻断保存或已有模型的调用。远端列表通常不是稳定的 capability contract，因此仅用它补充“当前 Key 可见的模型 ID/显示名”；上下文窗口、最大输出与思考配置优先来自有来源和版本的静态目录，且允许用户明确覆盖。

## #24 点名品牌：协议与预设边界

| 品牌 | 已核验的官方接入事实 | 预设处理建议 |
| --- | --- | --- |
| OpenAI | 原生同时有 Chat Completions 与 Responses；其官方 API 也提供模型列表。见上节链接。 | 同一品牌给两个协议选项；默认建议 Responses，但不要迁移已有 Chat 用户配置。 |
| Anthropic / Claude | 原生为 Messages 协议和模型列表，而非 OpenAI Chat。见上节链接。 | 独立 `anthropic_messages` 协议预设，保留可编辑 Base URL。 |
| DeepSeek | 官方说明 OpenAI 兼容接入，另有 Anthropic 兼容与 Responses 文档；Responses SSE 的终止语义不是 Chat 的 `[DONE]`，且其说明为无状态。 [官方 OpenClaw 接入](https://api-docs.deepseek.com/guides/agent_integrations/openclaw)、[官方 Responses](https://api-docs.deepseek.com/guides/responses_api/) | 首期用已实现的 OpenAI Chat；Responses 放入新增协议的兼容性测试矩阵后再开放，不能沿用 Chat SSE 解析。 |
| 智谱 GLM | 通用 API 的 OpenAI Chat 兼容 Base URL 为 `https://open.bigmodel.cn/api/paas/v4`；支持流式、`max_tokens`、`temperature`，思考内容可能位于 `delta.reasoning_content`。Coding Plan 使用不同端点/Key。 [官方 OpenAI 兼容说明](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction)、[官方 Chat](https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E5%AF%B9%E8%AF%9D%E8%A1%A5%E5%85%A8)、[Coding Plan](https://docs.bigmodel.cn/cn/coding-plan/quick-start) | 普通 API 与 Coding Plan 是不同预设；首期普通 API 走 OpenAI Chat。将 `thinking` 作为该模型的厂商扩展，而非全局参数。 |
| Kimi / Moonshot | 本轮未能取得可稳定抓取、可复核的 Moonshot 官方端点页面。不能把常见社区 URL 当作已核验的预设事实。 | 保留“自定义 OpenAI 兼容”入口；Kimi 预设在产品负责人复核官方平台文档、认证和模型生命周期后再加入。 |
| 火山引擎方舟 | 官方文档显示 Ark 有 OpenAI 兼容接入及 Responses 示例；Coding/Agent Plan 存在专用 URL/Key，且部分 Coding 兼容接口不支持 OpenAI `developer` role。 [官方 OpenAI 兼容](https://www.volcengine.com/docs/6492/2192012?lang=en)、[官方 Responses 示例](https://www.volcengine.com/docs/82379/1795150) | 普通 Ark 与套餐专用入口分成预设；先走 Chat，Responses 仅在对应 endpoint 的 wiremock 合约通过后开放。 |
| MiniMax | 官方 OpenAI 兼容文档提供 `GET /v1/models`，Base URL 为 `https://api.minimax.io/v1`。 [官方 Models](https://platform.minimax.io/docs/api-reference/models/openai/list-models)、[官方 AI SDK 协议说明](https://platform.minimax.io/docs/api-reference/text-ai-sdk) | OpenAI Chat 预设 + 在线模型发现；不要因为其 SDK 可选 Anthropic 兼容就让品牌强绑一种协议。 |
| 阿里百炼 / 通义千问 | 官方有 OpenAI Chat、Responses、Anthropic 兼容；Base URL 随地域和工作空间而变，Key 也随地域/计费计划绑定。 [官方协议总览](https://help.aliyun.com/zh/model-studio/qwen-api-reference)、[Chat Base URL](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)、[Responses 迁移](https://help.aliyun.com/zh/model-studio/compatibility-with-openai-responses-api) | 预设不能把一个北京公共 URL 当全部用户的默认真相：要求选择地域/工作空间或保留 URL 模板，用户可编辑。首期 OpenAI Chat，Responses 后续按 endpoint 验证。 |

## 对开源项目的取舍

1. [CC Switch 官方仓库](https://github.com/farion1231/cc-switch) 的 README 明确说明它服务九种 AI 工具、50+ 预设、SQLite 原子写入、MCP/Skills 管理、托盘切换和云同步。可借鉴的是“预设目录与用户实例分离”：用户选择预设后得到一份可编辑的本地配置，而不是把预设当运行时逻辑。其 SQLite、跨工具文件双向同步、云同步、代理/转发和大量工具适配服务的是另一类“AI CLI 配置中枢”，不适合翻译桌面应用引入。
2. [LiteLLM 官方仓库的模型成本/上下文目录](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) 将模型 ID 与上下文、输出、模态等元数据独立于单次请求适配。这可借鉴为 LingoStack 的小型、人工审核 catalog；但 LiteLLM 的多提供商网关和路由面向服务端，LingoStack 不应为此加入代理或运行时路由。
3. [Continue 官方仓库](https://github.com/continuedev/continue) 将模型配置置于用户可编辑配置面，而不是隐藏在固定品牌判断中。可借鉴“自定义模型永远是一等入口”；其 IDE 集成、索引、Agent/MCP 生态不属于本 Issue。

## 方案比较与推荐

| 方案 | 优点 | 主要风险 | 结论 |
| --- | --- | --- | --- |
| A. 只加品牌下拉，继续所有请求走 OpenAI Chat | 改动最少 | Claude/Gemini 失真；Responses 不能正确流式；品牌与协议耦合 | 不采用 |
| B. 复制 CC Switch 的全量管理/同步架构 | 预设数量多 | 引入数据库、代理、同步、跨工具写入，显著超出译栈与零遥测/BYOK 边界 | 不采用 |
| C. 静态 catalog + 可编辑用户实例 + 协议级发现/适配（推荐） | 兼顾可信起点、离线可用、用户自定义和测试可控；仅扩展现有 Rust/前端边界 | 要维护少量审核数据与每协议 mock 合约 | 采用 |

### 推荐数据形状（概念，不是本轮实现）

```text
ProviderPreset { id, brand, protocol, default_base_url_or_template,
                 auth_scheme, docs_url, discoverer, catalog_version }
ProviderInstance { id, preset_id?, name, protocol, base_url, api_key,
                   model_overrides, capability_overrides }
ModelDescriptor { id, display_name?, capabilities, context_window?,
                  max_output_tokens?, parameter_support, source, updated_at }
```

`Protocol` 应至少把现有 `open_ai_compatible` 拆成 `openai_chat_completions` 与 `openai_responses`，并保留 `anthropic_messages`、`gemini_generate_content`、`ollama_openai_compatible`。调用侧仍只面对稳定的“请求/文本流”接口；协议层负责请求翻译、认证头、SSE 事件到文本增量的投影。首期仅把跨协议确定支持的 `temperature` 和“最大输出”作为可选设置；思考深度、top-p、top-k 等应仅当 `ModelDescriptor` 声明支持时展示，并作为协议特定枚举/数值写入，避免“万能高级参数”造成 400。

## 配置迁移与安全

- 旧 `ProviderConfig.kind` 可无损映射：`open_ai_compatible` → `openai_chat_completions`，其他三个对应原生协议；保存新格式时带 `schema_version`，读取旧配置时只做内存迁移再由下次保存落盘。未知将来枚举要报可操作错误，不可默默改为 OpenAI。
- `preset_id` 必须可选。已有自定义提供商、私有网关和 Ollama 配置不依赖 catalog，升级不能联网、不能改 Base URL、不能替换用户模型列表或模型分配。
- 预设只保存公开元数据；API Key 继续只在本机配置文件中保存。当前 Rust `Debug` 已脱敏 Key，配置文件写入设计为 `0600`；新增发现/错误日志、HTTP fixture、前端状态、崩溃信息都不能包含 Authorization、原始 Key 或完整请求头。
- 在线刷新仅在用户显式操作时使用当前表单 Key；禁止自动后台刷新、遥测或上传模型列表。失败信息仅显示 HTTP 状态与安全截断的响应说明。

## 验证边界

1. **Core 单测：** 旧 JSON 迁移、预设实例化、用户覆盖优先级、未知 protocol、模型能力筛选与不持久化的发现结果。
2. **LLM wiremock 集成测试：** 每个协议的路径、认证头、请求体、成功与 401/429/5xx；Chat `[DONE]`、Responses 的 `response.output_text.delta`/完成或失败事件、Anthropic `content_block_delta`、Gemini SSE 的解析各自独立覆盖。不得使用真实 Key。
3. **模型发现合约：** OpenAI/Anthropic/Gemini/MiniMax 各一组正常、分页（适用处）、权限失败、协议不支持、格式异常 fixture；确认“刷新失败仍可手填/保存/调用”。
4. **前端 Vitest：** 预设创建后可编辑、URL 模板提示、模型多选与功能分配、能力不支持时参数隐藏、无预设自定义流程、密钥不出现在 DOM 错误或日志断言中。
5. **人工验收：** 使用测试 Key 或 mock 环境分别验证四个既有协议与至少一个 Responses 实现；供应商的真实可用模型、套餐权限和地域限制不是 CI 可替代的证据，应单独记录。

## 建议首批范围与开放决策

**首批建议。** 发布小 catalog：OpenAI（Chat/Responses）、Anthropic（Messages）、Gemini（Generate Content）、DeepSeek（OpenAI Chat）、智谱普通 API（OpenAI Chat）、MiniMax（OpenAI Chat + 发现）、百炼/通义（OpenAI Chat，区域 URL 模板）；保留现有 Ollama 和“自定义提供商”。模型发现首批只实现官方已核验接口；Responses 先实现 OpenAI 原生并以单独协议选择呈现。Kimi 和火山引擎待其最终官方 endpoint/账号类别进入可重复的 mock 合约后加入。

仍需产品决策的事项：

1. 首期是否把 OpenAI Responses 只给 OpenAI，还是在每一家宣称兼容的服务上分别完成合约后开放；推荐前者。
2. context/max-output 是仅展示 catalog 信息，还是允许用户手工输入限制；推荐“显示已知值 + 允许明确覆盖并标注未核验”。
3. 每个功能是否可选不同能力模型（文档翻译允许长上下文、图片 OCR 要求 vision）；推荐复用现有 feature assignment，在选项中过滤能力，而不是给每个品牌造专用页面。
4. 预设 catalog 的更新策略（应用发版、签名远程目录或两者）；推荐首期随应用发版，避免远程配置供应链和联网依赖。

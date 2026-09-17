# Issue 24 技术设计：LLM 提供商架构升级

## 1. Design goals

本设计把复杂度集中在三个 deep module 后：

1. **Provider catalog module**：小 interface 暴露“列预设、实例化、判断发现资格”，隐藏品牌端点、认证和审核模型数据。
2. **Model policy module**：小 interface 暴露“解析某功能的可执行模型与参数”，隐藏来源优先级、能力过滤和协议参数校验。
3. **LLM transport module**：保留 `LlmProvider::chat_stream` 作为功能调用 seam；另以单一 `discover_models(request)` interface 隐藏各厂商模型列表、分页和响应归一化。

删除任一 module 后，相同规则会散落到设置页、Tauri 工厂和各协议测试中，因此这些 seam 具有实际 leverage；不为只有一个实现的流程额外引入 trait。

## 2. Target domain model

### 2.1 Core types

在 `lingostack-core` 中以纯 Rust 类型承载配置与静态目录：

```text
AppConfig {
  schema_version,
  providers: Vec<ProviderInstance>,
  models: ModelAssignment,
  ...
}

ProviderInstance {
  id,
  preset_id?,
  name,
  protocol,
  base_url,
  auth,
  api_key,
  parameter_profile,
  models: Vec<ModelDescriptor>
}

ProviderPreset {
  id,
  brand,
  display_name,
  protocol,
  suggested_endpoints[],
  auth,
  docs_url,
  discovery?,
  initial_models[]
}

ModelDescriptor {
  id,
  display_name?,
  supported_features,
  context_window?,
  max_output_tokens?,
  parameter_support,
  origin
}

SourcedValue<T> {
  value,
  source: bundled_verified | provider_reported | user_override,
  source_url?,
  verified_at?
}

ModelRef {
  provider_id,
  model,
  generation: GenerationSettings
}
```

`GenerationSettings` 含可选 temperature、max_output_tokens 与封闭的协议专用 reasoning 枚举。禁止 `HashMap<String, Value>` 式万能高级参数。

### 2.2 Protocol and auth

`Protocol`：

- `open_ai_chat_completions`
- `open_ai_responses`
- `anthropic_messages`
- `gemini_generate_content`

Ollama 预设选择 `open_ai_chat_completions`，调用端点使用其 OpenAI compatibility；本地模型发现单独走 `/api/tags`。品牌不进入协议枚举。

`AuthScheme`：

- Bearer
- Anthropic x-api-key
- Gemini API key
- None

表单必填规则来自 auth；Ollama 的 None 不再被当前“API Key 一律必填”误拦。

### 2.3 Parameter profile

兼容协议不保证参数名完全一致。实例复制一个审核过的 `ParameterProfile`，其中同时保存核验时的 protocol/endpoint scope，并明确：

- temperature 是否可发送；
- 最大输出映射为 `max_tokens`、`max_completion_tokens`、`max_output_tokens` 或 Gemini `generationConfig.maxOutputTokens`；
- reasoning 使用哪个封闭控制形状。

模型 `parameter_support`、实例当前 protocol/endpoint 与 `parameter_profile` 必须同时匹配，参数才进入请求。编辑到 scope 外时 profile 保留作审计但不生效，运行时自动退回不发送可选参数的保守行为；自定义实例同样默认保守。

## 3. Catalog module

建议新增 `crates/lingostack-core/src/provider_catalog.rs`，external interface 保持为三类纯函数：

- `provider_presets()`：返回随版本发布的预设视图；
- `instantiate_preset(preset_id)`：复制为独立的 `ProviderInstance` 草稿；
- `discovery_profile_for(instance)`：只有 preset、protocol、endpoint 仍匹配审核条目时返回发现配置。

实现隐藏所有首批品牌数据和模型规格证据。静态模型值必须逐模型带官方 URL 与核验日，不能从品牌继承。

预设实例化后，保存的实例独立存在；catalog 更新只影响新实例。编辑到未验证端点时 `discovery_profile_for` 返回 None，但通常不阻止保存和调用。OpenAI Responses 的首期资格更严格：实例必须仍匹配官方 preset/protocol/endpoint；否则保存校验要求用户恢复官方端点或切换到其他协议，避免借官方预设绕过“仅 OpenAI 官方开放 Responses”的范围门禁。

## 4. Model policy module

在 `config.rs` 或新的 `model_policy.rs` 提供一个高 leverage interface：

```text
resolve_request(feature) -> ResolvedModelRequest {
  provider,
  model,
  generation
}
```

它一次完成：

1. 功能默认 → 全局默认回退；
2. provider/model 存在性；
3. `supported_features`；
4. generation 数值范围；
5. 模型支持与 parameter profile 的交集；
6. reasoning 枚举与协议匹配。

Tauri 调用方不重复这些判断。错误继续是扁平、中文、可比较的领域枚举，并在 IPC 边界拍平成字符串。

发现结果合并另设纯函数 `merge_discovered_models(existing, discovered)`，优先级固定为：

```text
user_override > bundled_verified > provider_reported > ID-only candidate
```

失败或空结果不调用 merge；merge 从不删除 existing。

## 5. LLM transport

### 5.1 Chat interface

`LlmProvider` 保持单一 `chat_stream(&ChatRequest)` interface。扩展 `ChatRequest` 接收已由 core/Tauri 验证的规范化 `GenerationOptions`，各协议 adapter 只负责 wire mapping，不重新决定产品策略。

建议把当前 `openai.rs` 明确为 Chat Completions 实现，并新增独立 Responses adapter。是否物理重命名文件由实施时以最小 diff 决定，但公开类型必须能区分两种协议。

### 5.2 OpenAI Responses adapter

Responses adapter 独立处理：

- system 消息到 `instructions`；
- user/assistant 对话到 `input`；
- `max_output_tokens` 与 reasoning effort；
- `response.output_text.delta` 文本增量；
- completed、failed、error 等具名事件；
- 非文本事件跳过；
- HTTP 非 2xx、流 JSON 错误、零输出重试分类与 Key 脱敏。

不得把 Chat 的 `choices[0].delta.content` 或 `[DONE]` 当 Responses 合约。

### 5.3 Discovery module

在 `lingostack-llm` 新增 `discovery` module，external interface 只有：

```text
discover_models(DiscoveryRequest) -> Result<Vec<DiscoveredModel>, LlmError>
```

内部按 `DiscoveryKind` 处理：

- OpenAI style：OpenAI、DeepSeek、MiniMax；
- Anthropic：cursor 分页；
- Gemini：过滤支持 generateContent，并读取 provider-reported token limits；
- Ollama tags：解析本地 `/api/tags` JSON。

HTTP 是 true external dependency；production 与 wiremock 在相同 HTTP seam 上运行，不再引入只为测试存在的公开 port/trait。所有错误经过统一截断与 secret 擦除。

## 6. Tauri orchestration and IPC

新增三个类型化命令：

1. `list_provider_presets`：公开非敏感 catalog。
2. `instantiate_provider_preset`：按 preset id 返回独立草稿。
3. `discover_provider_models`：接收当前表单草稿，先用 core 判定发现资格，再调用 llm discovery，返回候选；不保存配置。

命令在 `src-tauri/src/lib.rs` 注册，并在 `src/lib/ipc.ts` 有唯一前端封装。Rust 类型、`src/lib/config-types.ts` 与 `fixtures/ipc-contract.json` 同步。

`build_provider` 只按 protocol 分派；品牌、preset_id 不参与 match。所有聊天与文档翻译路径改用 `resolve_request(feature)` 的已验证结果。

## 7. Frontend flow

### 7.1 Add/edit provider

沿用 Settings AI 的内联编辑区：

1. 点击“添加提供商”；
2. 先出现预设选择器，“自定义”置首；
3. 选择预设后从后端实例化草稿；选择自定义则创建空草稿；
4. 名称、协议、端点、认证字段、模型均可编辑；
5. 模型输入框与“刷新模型”按钮同排；仅当当前草稿仍匹配审核发现配置时显示按钮；
6. 输入框保持逗号/空白分隔的手工输入能力，并作为可输入多选下拉框的文字入口；
7. 刷新成功后，规范化候选进入输入框附属的下拉列表；点击或键盘选择候选时直接切换当前表单模型集合，不再出现独立复选框结果区和“添加所选模型”按钮；
8. 下拉选中态始终从当前表单模型集合派生，已保存模型在重新编辑、再次刷新后仍显示为已选；
9. 显式保存后才写入 config。

保存失败保持表单和未保存选择，沿用当前 toast/error 策略并补稳定 live region。

### 7.2 Model details and assignment

每个已选模型显示紧凑详情行：

- ID 与来源；
- context/max output 及各自来源 badge；
- 可覆盖输入；覆盖后立即标记“未经应用核验”；
- 支持的功能；
- 参数支持。

功能模型下拉通过纯 selector 过滤。选中后只展示该模型/协议支持的 generation controls。视觉继续用分割线、留白和现有原语，不增加嵌套卡片。

### 7.3 State placement

- 持久实例和功能分配继续由 `config-store` 管理。
- 预设列表、发现加载/错误和未保存表单只属于设置页会话，不进入全局 store。
- 删除与模型文字分离的 `selectedDiscovered` 临时状态；手工输入、下拉选择、模型详情和最终保存都从同一模型 ID 集合派生，避免“已勾选但未加入草稿”的双重状态。
- 将 catalog 合并、能力过滤、generation 控件判定抽到 `src/lib/provider-catalog.ts` 等纯函数，组件只编排可观察交互。

## 8. Configuration compatibility

新 schema 带显式版本。根据 Issue 决策：

- 不自动迁移旧 providers；
- 不双写；
- 旧 schema 读取返回可操作错误；
- 默认配置与 E2E fixture 直接切到新 schema；
- 发布说明明确开发期配置需重新创建。

配置文件写入仍走 Rust。API Key 继续被手写 Debug 脱敏；新 auth、discovery 和 Responses 错误路径各有 secret regression test。

## 9. Validation strategy

### Pure/domain

- catalog 完整性、唯一 ID、实例化深拷贝语义；
- schema 版本与 serde 往返；
- model merge 优先级；
- feature/parameter/reasoning 校验；
- TS/Rust fixture 同步。

### Protocol/boundary

- Responses 请求、认证、增量/完成/失败事件；
- Chat、Anthropic、Gemini 既有 fixture 回归；
- discovery 正常、分页、空、401/429/5xx、坏 JSON、secret redaction；
- Ollama tags 与 OpenAI SSE 调用的区分。

### UI

- 自定义置首与全部预设；
- 预设实例化后可编辑；
- URL/协议失配时发现动作消失；
- 模型多选、手工补充、刷新失败保留；
- 来源 badge、覆盖标记、能力过滤、参数显隐；
- `aria-busy`、live result、alert、Key 掩码；
- 保存失败不关闭表单。

### Runtime

- Tauri feature test 与 production isolation；
- Windows WDIO 真实 IPC：预设保存、模型分配、Responses fixture stream；
- 不把确定性 fixture 结果表述为真实第三方服务可用；真实供应商账号另做人工验收。

## 10. Risks and rollback

- **配置破坏性变化**：已由“未上线、无需迁移”决策接受；通过 schema 错误和发布说明避免静默损坏。
- **catalog 时效性**：每项含来源与日期；随应用发版更新，运行时不远程拉 catalog。
- **兼容协议漂移**：parameter profile 默认保守；只有 wiremock 锁定的映射才开启。
- **发现端点失败**：只影响显式刷新，绝不阻断保存或聊天。
- **跨 IPC 漂移**：共享 fixture + 真实 E2E；TS build 不能单独作为往返证据。
- **回滚**：产品代码可按提交回滚；新旧配置不兼容，因此回滚旧二进制前必须使用备份的旧开发配置或重新配置。不得把代码回滚表述为配置自动恢复。

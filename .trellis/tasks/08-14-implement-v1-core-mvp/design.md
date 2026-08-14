# V1 核心 MVP 技术设计

## 1. 边界与实施形态

本任务采用“父任务定义跨域契约，四个子任务依次交付”的形态。保留现有 Cargo workspace、单 Tauri 主窗口、能力 crate + 薄应用层 + React/Zustand 架构，不引入独立划词窗口、服务端、账号或遥测。

运行验收以 Windows 为准；macOS/Linux 只要求三平台 CI 可编译、占位能力继续返回类型化 `Unsupported`。任何原生能力调用继续经 trait 工厂隔离，调用侧不得新增平台分支。

## 2. 核心数据流

### 2.1 翻译、语言解析与词条

```text
输入/划词
  -> Rust 纯逻辑检测源语言并应用映射/界面语言/全局目标规则
  -> 解析 translate 功能模型（功能默认 -> 全局默认）
  -> 组合“用户/内置翻译风格 Prompt + 不可覆盖的机器协议后缀”
  -> 单次 provider-neutral chat stream
  -> 前端增量协议解析器
       -> 译文持续进入 aria-live 结果区
       -> 完整元数据校验后一次性发布 0–5 个词条 tag
```

模型输出采用应用自有文本信封，不依赖 OpenAI/Anthropic/Gemini 各自不同的结构化输出功能：

```text
<目标语言译文>
<<<LINGOSTACK_TERMS_V1>>>
[{"term":"Ollama","category":"product","explanation":"..."}]
```

`category` 只允许 `technology | programming | product`。解析器按 chunk 增量识别完整 sentinel；sentinel 之前的内容可流式展示，sentinel 及 JSON 永不进入译文。完成时仅保留字段非空、类别合法、词面出现在原文或译文、按大小写归一后不重复的前 5 项。语义上“不是普通词”由不可覆盖 Prompt、类别约束和验收样例共同守护；本地不引入不可靠的通用术语词典。

信封缺失、JSON 损坏、条目非法或流在元数据阶段中断时，保留已解析译文并隐藏无效 tag；翻译失败仍沿用保留部分结果 + 手动重试。tag 在响应完成后出现，hover 与键盘 focus 均能打开解释，Escape/blur 关闭。

### 2.2 Prompt 兼容性

用户自定义翻译 Prompt 是风格指令，不再能替换机器协议。应用始终追加固定协议后缀，其中包含源/目标语言、术语类别、最多 5 项、原文语种解释和 JSON schema。命名 Prompt 继续独立。旧的 `Explain` 功能配置只为反序列化兼容保留或迁移，V1 不发起单独 Explain 请求。

### 2.3 错误与限流

网络、超时、5xx 和 429 只在“尚未向前端发送任何内容”时自动重试一次，避免部分译文后重试造成重复拼接；等待采用短指数退避。429 同时进入共享冷却窗口，新请求在冷却结束前等待并显示限流状态。流已经产生内容后发生错误时不自动重放，保留部分译文并交给用户重试。401/403 与协议解析错误不自动重试。

### 2.4 配置与语言

Rust `AppConfig` 继续是持久化真源，TypeScript 保持手写镜像并加契约测试。界面语言使用明确的 `system | zh | en` 模式；翻译源语言可自动检测，目标语言默认由 core 四级规则计算，用户可对当前请求显式覆盖。

主题配置以 Rust JSON 为真源，`localStorage` 只保留启动前防闪烁缓存；配置加载/更新时双向同步该缓存。语言映射、Prompt、热键、主题与界面语言均从设置页真实读写。

移除 V2 的 `TranslatePopup` 产品动作，同时兼容读入旧配置：旧 `translate_popup` 映射到 `translate_selection`，同一动作重复时保留最后一条（现有默认顺序因此保留 `Ctrl+Shift+D`），下次保存只写新值。

### 2.5 热键、托盘与桌面反馈

新增窄 IPC 命令用于重新注册热键：先注销本应用旧绑定，再尝试注册新绑定并返回/广播全量状态；单条失败不阻断其余绑定。设置页展示真实组合、状态和错误，可重新捕获合法组合并保存。

托盘菜单只路由主窗口内视图：打开主窗口、划词翻译、收藏、设置、退出。划词取词结果的 `source=clipboard` 进入非阻塞提示；最终失败显示可操作错误并保留手动粘贴入口。

TTS 保留 Windows 单例朗读线程。前端维护轻量 speaking/error 状态，同一按钮可开始/停止，错误通过可访问状态区显示；不把 Web 前端状态解释成真实播放完成事件。

## 3. 前端组织

- 保持现有单层主面板、`ViewShell`、语义 token 与手写 UI 原语。
- 词条 tag 放在译文正文下方，以分割线/留白组织，不创建嵌套卡片。
- 双语 UI 使用仓库内类型化字典和翻译函数，不为中英两种语言引入大型 i18n 依赖；视图元数据、按钮、状态、错误辅助文案均迁移到字典。
- 异步结果用 `aria-live` / `aria-busy`，错误用 `role=alert`；tooltip/tag 必须键盘可达。
- Favorites 继续使用 IndexedDB 扁平 schema，不为 tag 单独扩表；收藏仍保存原文与完整译文。

## 4. 测试与发布门禁

自动化分四层：

1. Rust 纯逻辑/serde/重试分类与 provider wiremock。
2. TypeScript 信封解析、配置迁移、命名边界、IndexedDB/store 单测。
3. Testing Library 覆盖词条 tag、设置、冲突反馈、TTS 错误与可访问性。
4. Windows WebdriverIO Tauri E2E 覆盖可 mock 的核心窗口链路；UIA/SAPI 的真实系统效果另做 Windows 手工验收记录。

桌面 E2E 采用 Tauri 2 当前推荐的 WebdriverIO Tauri service；其 embedded provider 可避免手工维护 EdgeDriver，测试依赖固定在 pnpm lock 中。基础 runner、feature gate、mock 边界和 CI job 由 `tauri-e2e-ci` 独立工作树负责，本分支功能开发不并行修改这些基础文件。该产出评审并进入本分支后，第 4 个子任务补充 V1 场景并执行集成门禁。CI 先把 E2E 作为 Windows 独立 job，稳定后作为 V1 合并门禁。

开源侧只补显式缺口：确定性生成 `THIRD_PARTY_NOTICES`，并在 CI 校验生成结果未漂移。现有 MIT、贡献规范、模板、DCO、Dependabot 与 audit 流程只验证不重写。

## 5. 兼容、回滚与风险

- 配置：新增字段必须带 serde 默认值、Rust/TS 默认值同步与旧 JSON fixture；破坏性枚举变更必须迁移。
- 流协议：sentinel 极低概率出现在自然译文中；只在独立完整行精确匹配，类似文本不触发。协议失败降级为纯译文。
- LLM：自动重试仅限零输出阶段，防止重复内容与重复计费失控；总调用最多 2 次。
- 热键：重注册失败仍保留成功项与可见错误；不得让设置保存失败静默伪装成功。
- E2E：原生选区与真实音频不适合无交互 CI，自动化验证事件/IPC/界面闭环，手工证据验证真实 UIA/SAPI。
- 回滚按子任务独立进行；每个子任务完成全量门禁并单独提交。信封解析和配置迁移必须先落地，后续 UI 才可依赖。

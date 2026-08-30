# 连续 Markdown 阅读器实施计划

## Execution contract

- 用户已明确授权本轮重构设计并实施；任务保持 `in_progress`。
- 先补 interface 行为测试，再实施；Trellis implement/check sub-agent 必须保留工作树现有改动。
- 不提交、不推送、不归档，除非用户另行明确授权。

## Phase 1 — Canonical Markdown and persistence

- [x] 为每个 `BlockKind` 写源 Markdown 规范化测试，覆盖受保护内容。
- [x] Schema 升级至 v3，blocks 增加 `markdown_kind`；验证 v2 记录迁移并按 paragraph 兜底。
- [x] 新导入保存 kind 以规范化源 Markdown；translation request 一次提交整篇 Markdown，不暴露 parser block 到 caller。
- [x] 新增 `DocumentView` / `DocumentContent` 和整篇 `document_content` interface。
- [x] source/translation 按序合并；未完成译文不进入 reader；重译 active/working 行为保持。

## Phase 2 — Prompt, Tauri and TypeScript contract

- [x] 独立文档 Prompt 改为完整目标语言 Markdown 文档协议。
- [x] Tauri `render_document` 改为返回 `DocumentContent`；移除 reader-facing blocks/terms commands 和 handler 注册。
- [x] 同步 TypeScript types/ipc，并为 serde JSON shape 和首次导入 `data.id` 写回归测试。
- [x] E2E deterministic adapter 返回一篇完整 Markdown，并验证代码、标识符与 Markdown 语义仍在全文中。

## Phase 3 — Compact document UI

- [x] 导入按钮最终移到顶部原文/译文切换右侧，删除左栏底部按钮容器与顶部说明。
- [x] 主阅读区只保留 source/translation toggle；最终产品规则为 completed 列表点击默认 translation，其余列表点击默认 source，新导入翻译自动 translation。
- [x] 使用安全 Markdown renderer 展示当前整篇内容。
- [x] 列表项最终只显示图标与文件名；移除状态文字、百分比、块行、双/单栏、块复制和术语面板。
- [x] 复制和导出只针对当前完整 Markdown；未完成译文不导出伪造内容。
- [x] 保持筛选、取消/整篇重试/重译、二次删除、drop、live/alert 和滚动位置（暂停/继续用户语义已由 `08-30-document-settings-ux` 取代）。
- [x] 更新中英文文案与 RTL 测试。

## Phase 4 — Integration and finish

- [x] 运行 workspace fmt/clippy/test、feature-gated app、生产隔离和 Windows Tauri E2E。
- [x] 运行 release build与 notices generation；记录手动 Windows UI 和其他平台证据边界。
- [x] 更新 docparse/document/app/frontend code-spec 与 ADR/任务调试记录。

## Phase 5 — Desktop interaction hardening

- [x] 为删除按钮无响应建立失败测试，补 `dialog:allow-message` 并把确认失败纳入页面错误反馈。
- [x] 验证两次确认、取消不删、成功删除持久化记录与列表回退选择；文件右键删除复用同一路径。
- [x] 全局禁用 WebView 默认右键菜单，实现可访问的应用内菜单基础组件。
- [x] 文件列表增加查看译文、查看原文、删除菜单；Markdown 阅读区增加复制所选、复制全文、全选菜单。
- [x] 原文/译文切换改为高亮 radio 分段控件，按记录状态自动选择并保持手动切换与滚动隔离。
- [x] 更新 RTL / capability regression / Windows E2E，运行影响范围质量门禁。

## Phase 6 — Whole-document translation correction

- [x] 为待翻译阅读器中泄漏 `[未翻译]` 和源片段建立 RTL 红灯回归。
- [x] 新建兼容性 v4 文档结果持久化；新任务一次提交整篇规范化 Markdown，完整结果原子提升。
- [x] 翻译中的译文阅读器只显示文档级状态，旧分块记录仅保留读取兼容。
- [x] 收紧暂停/取消迟到结果与任务 registry 清理；完成的整篇结果报告 100%，未完成旧记录不进入 reader。

## Phase 7 — Document translation model settings regression

- [x] 将 AI 设置内已有但误标为“译文”的 `doc_translate` 行接入明确的文档模型选择器，并保持现有配置与回退契约。
- [x] 空选项明确显示全局默认回退；不新增配置字段或模型解析规则。
- [x] 以 SettingsView RTL 覆盖选择持久化、清空回退和删除提供商后的分配清理。

## Phase 8 — UI polish and concurrent imports

- [x] 文档 toolbar 左置原文/译文 radio，移除进度 Label 和左栏“文档记录”标题容器。
- [x] 文件选择器与拖放支持多文件并发导入；列表项补翻译中动画、可访问状态与失败隔离测试。
- [x] AI 文档模型 Label 简化为“文档”；外观面板本地化主题/Prompt Label 并统一表单间距。
- [x] 关于页改为居中 Logo、描述和禁用的更新检查占位按钮。
- [x] 补齐 RTL/a11y 回归并运行 lint、test、build；本轮纯前端呈现未追加桌面 E2E。

## Phase 9 — Durable document failure feedback

- [x] 复现“列表已失败、reader 仍显示翻译中、无失败原因”的真实 Windows 桌面红灯。
- [x] Schema 升级至 v5，持久化可选 `error_message`；旧失败记录保持 null，由 UI 本地化兜底。
- [x] 同步启动与后台 request/provider/空响应/保存/完成失败写入失败快照并广播；重试、取消、成功清理旧原因。
- [x] failed/partial_failed 的原因从持久快照进入去重错误 Toast；列表保留失败状态和重试，reader 不再显示失败详情或“翻译中”。
- [x] 持久化错误限制 500 字符，并覆盖 URL query、紧凑 JSON、Bearer/token/API key 脱敏回归。
- [x] 通过 document/app Rust、DocsView/store RTL、fmt/clippy/workspace tests、lint/test/build、diff check；Windows 旧失败记录实跑显示中文兜底与重试且无“翻译中”。
- [ ] 增加可控 app integration/E2E fixture，运行时覆盖异步 provider/空响应/保存/完成/request 构造失败的快照与事件链路；本轮源码审查通过，但不宣称这部分已有自动化运行时覆盖。

## Phase 10 — Response stream recovery and failure Toast

- [x] 在 parser/provider seam 复现 `error decoding response body` 被误分类为不可重试 `Stream`，将响应体读取/解压错误保留为可重试传输错误；真实 SSE/JSON/UTF-8 解析错误仍不可重试。
- [x] 为文档翻译增加零输出最多一次重试，并覆盖首轮传输失败后成功、已有部分输出不重试。
- [x] 文档失败原因改为持久快照驱动的去重错误 Toast；列表失败状态和重试入口保留，reader 不重复显示详情。
- [x] 导入按钮移到原文/译文右侧并移除左栏底部按钮容器；Toaster 顶距测试同步为 16px。
- [x] 通过 LLM/app 定向 Rust 测试、DocsView/Toaster RTL、fmt、clippy、lint、build 与 diff check；真实外部 provider 未重放，wiremock 无法稳定制造 reqwest body decoder 错误的限制已记录。

## Phase 11 — Status-driven reader interaction

- [x] 补 RTL 红灯：completed item 默认译文、其他状态默认原文，右键显式模式不被自动策略覆盖。
- [x] 导入选择与拖放成功启动翻译后自动进入译文；多文件并发与单项失败隔离不回退。
- [x] translation + translating 时 reader 使用持续覆盖式加载层，父区 busy；完成后原位显示完整译文，失败/取消退出加载态。
- [x] 列表项移除可见状态和百分比，只保留图标与文件名；通过 `aria-label` 保留本地化状态，活动图标支持 reduced-motion。
- [x] 独立 check 修正 reader busy 边界及 paused/unsupported 译文占位；DocsView RTL 26/26、前端全量 204/204、lint、build、production-isolation 与 diff check 通过。
- [x] 复用既有 Windows 开发窗口完成桌面验收：失败文档默认显示原文，顶部原文/译文与导入入口布局正确，列表项仅显示图标和文件名；翻译中覆盖层及完成切换由可控状态测试验证，未重新发起真实模型请求。

## Phase 12 — Long-running stream timeout recovery

- [x] 以本地 TCP SSE fixture 复现：每 120ms 持续产生有效增量、总时长超过 300ms 时，reqwest 总请求 deadline 仍返回 `Timeout`。
- [x] 三类流式 provider 共用无总 deadline、60 秒单次读取超时和 15 秒连接超时的 HTTP client；保留既有 `LlmError::Timeout` 映射与零输出重试契约。
- [x] 回归 fixture 在相同流上完整收到全部增量，并在同一真实 `bytes_stream` seam 覆盖读取停滞仍映射 `LlmError::Timeout`；`cargo test -p lingostack-llm`（48/48）、crate clippy、fmt 与 diff check 通过。

## Validation

```powershell
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo test -p lingostack-app --features e2e
pnpm lint
pnpm test
pnpm build
pnpm test:production-isolation
pnpm test:e2e
cargo build --release -p lingostack-app
pnpm notices:generate
```

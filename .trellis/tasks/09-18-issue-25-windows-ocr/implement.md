# Windows 本地 OCR 实施计划

## 1. Feasibility gate and shared contract

- [x] 用最小 Windows 编译探针验证 `windows 0.61` 的 `OcrEngine`、内存流、解码缩放、语言枚举和 `IAsyncInfo.Cancel`；记录需要的 target features。
- [x] 新建 `lingostack-ocr` crate，定义输入、结果、错误、操作取消语义与工厂；补正常、边界、错误、对象安全和占位测试。
- [x] 在根 `Cargo.toml`、`src-tauri/Cargo.toml` 和 `CLAUDE.md` 注册新 crate；调用侧不写平台分支。
- [x] 实现 10 MiB、40 MP、魔数/声明格式一致性、等比尺寸计算等纯逻辑测试。

Rollback point: WinRT 不能真实取消或缩放时停止，不进入 UI 实施。

## 2. Windows engine

- [x] 从内存字节创建 WinRT 流，读取 BitmapDecoder 元数据并在完整解码前拒绝危险尺寸。
- [x] 将超出 OCR 最大边长但仍在安全像素范围的图片等比缩放为 `SoftwareBitmap`。
- [x] 实现 auto 与 zh/en/ja 已安装语言匹配、缺语言错误、RecognizeAsync、无文字和取消映射。
- [x] 确保平台异常只输出脱敏短文案；图片、路径和原始异常体不进入日志。
- [x] 添加可确定的 fake backend/operation 测试；真实系统调用测试只声明环境自洽，不冒充识别质量。

## 3. Tauri cancellation and IPC

- [x] 给 `AppState` 增加 OCR/chat 请求注册表，并实现 panic-safe 的注册、取消、完成清理。
- [x] 新增 `recognize_image`、`cancel_ocr`、`cancel_chat`；为两套生产 handler 同步注册 OCR/chat 命令。
- [x] 给 `chat_stream` 增加 request ID 与取消分支，确保 drop provider stream；维持既有错误、重试和 429 冷却规则。
- [x] 在 `src/lib/ipc.ts` 增加唯一类型化封装并补 IPC 参数名测试。
- [x] 增加 feature-gated OCR fixture engine，扩展生产隔离断言。

Rollback point: 若取消破坏既有流式重试/冷却，先回滚 chat 取消并修复设计，不交付半套图片抢占。

## 4. Frontend task state and UI

- [x] 新增 `ocr-store.ts` 与测试：成功、失败、取消、连续替换、迟到结果、视图卸载和不保存字节。
- [x] 扩展 `stream-store` 的 request ID、Prompt 前序号检查和保留内容取消；更新既有“进行中忽略”测试为显式 start/replace 规则。
- [x] 为翻译页增加 paste/drop、多图拒绝、图片优先、纯文字回退、拖入遮罩、识别状态和自动翻译。
- [x] OCR 中手动编辑、划词注入和新图片均按更新输入取消旧任务。
- [x] 为中英文词典补齐状态、限制、语言包与失败文案；所有反馈遵守 live/alert 语义和现有视觉 token。

## 5. Verification

- [x] 聚焦：`cargo test -p lingostack-ocr`、`cargo test -p lingostack-app --features e2e`、OCR/stream/TranslateView/ipc 的 Vitest。
- [x] 前端：`pnpm lint`、`pnpm test`、`pnpm build`。
- [x] Rust：`cargo fmt --all --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test --workspace`、`cargo build --workspace`。
- [x] 桌面边界：`pnpm test:production-isolation`、`pnpm test:e2e`，并确认进程/4445 端口清理。
- [x] 发行编译：`cargo build --release -p lingostack-app`。
- [ ] 发行公告：`pnpm notices:generate` 后确认 `THIRD_PARTY_NOTICES` 无非预期漂移。
- [ ] Windows 手工：断网中文、断网英文、图片+文字剪贴板、多图、语言缺失、无文字、4K 缩放、连续选图、翻译中选图、OCR 中手动输入、切页返回。
- [x] 隐私审计：确认 LLM fixture 只收到 OCR 文本，SQLite/IndexedDB/配置/日志无图片内容。

## 6. Documentation and review gates

- [x] 更新 OCR crate/package spec、IPC 命令清单、状态管理、UI 异步语义和 `docs/testing.md` Windows 手工清单。
- [x] 运行 `trellis-check` 全范围检查，修复设置页合并标记和旧配置测试夹具；前端、Rust、生产隔离、E2E 与发行编译门禁均通过。
- [ ] 向用户汇报 Windows 结果与 macOS/Linux 未完成边界；获得远端交付授权前不 push、不评论、不改标签、不关闭 Issue。

## 7. Integration failure prevention

- [x] 增加跨平台仓库完整性检查与 Node 回归测试，覆盖未合并索引、文本冲突边界、二进制跳过和 diff 格式错误。
- [x] 提供 `check:integrity`、`typecheck`、`verify:fast`、`verify` 单一入口，并用共享 provider/model fixture factory 降低测试数据漂移。
- [x] CI 增加独立 `Repository Integrity` 与稳定汇总检查 `Quality Gate`，并支持 `merge_group`。
- [x] 更新测试策略、GitHub Issue 生命周期和 PR 模板，明确冲突后重跑、红色基线先修、成功终态才可合并。
- [x] 本地完整门禁通过后，为 `main` / `develop` 配置并回读 GitHub ruleset（ID `23633632`）；本轮不提交、不推送。

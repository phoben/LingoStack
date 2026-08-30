# V1 质量与开源门禁

## Goal

用可重复的自动化与明确的 Windows 运行证据证明 V1 核心链路可用，并补齐显式要求的第三方许可证通知。

## Dependencies

- 前三个 V1 子任务均已完成并归档；本任务不替代其功能测试，只做最终覆盖与集成门禁。
- `tauri-e2e-ci` 已通过 PR #18 合入并归档。现有 WebdriverIO runner、test-only feature gate、确定性 mock、生产隔离检查与 Windows CI job 是本任务的复用基础，不得重建或改回另一套驱动。

## Current Baseline (2026-08-30)

- 真实 Tauri E2E 已覆盖启动/导航、确定性翻译、错误重试、模型设置持久化和收藏结果；剩余场景应增量补充。
- Favorites DB/store、config/theme/TTS store、设置视图与翻译信封已有测试；本任务只补跨 IPC 漂移、未覆盖视图/状态和最终集成语义。
- MIT、贡献规范、模板、DCO、Dependabot、`cargo audit` 与 `pnpm audit` 已存在，只需验证不退化。
- `THIRD_PARTY_NOTICES` 及生成/漂移检查、最终 Windows 人工/性能记录仍不存在，是明确阻断项。

## Requirements

- 建立 Rust/TypeScript 跨 IPC 契约回归，重点覆盖配置默认值、枚举、Channel/event 形状。
- 复核并补齐剩余的设置、收藏 view、翻译词条与桌面状态测试空白；不得重复已有 Favorites DB/store、config/theme/TTS store 测试。
- 在已经合入的 Windows WebdriverIO Tauri E2E 基础上增量扩展最终 V1 场景，使用 mock LLM/IPC 数据，不需要真实 API Key。
- 自动化覆盖文本翻译+tag、命名、设置保存、冲突恢复、收藏和可 mock 的划词/朗读状态链路。
- UIA 真实取词、SAPI 实际出声/停止、资源占用与感知延迟使用 Windows 手工清单记录。
- 确定性生成 `THIRD_PARTY_NOTICES`，覆盖 Rust 与生产前端依赖；CI 校验产物未漂移。
- 保留并验证现有 MIT、DCO、Dependabot、audit、Issue/PR 模板和三平台 CI。

## Acceptance Criteria

- [x] Windows E2E 在无真实密钥下覆盖既有五类场景，并补齐词条 tag、命名五乘五、热键冲突恢复及可 mock 的划词/TTS 状态链路；可在 CI 独立运行。（2026-08-30 Windows JUnit：10/10；fixture command 仅在 `e2e` feature command 表注册。）
- [x] Rust/TS IPC 镜像发生字段/枚举漂移时至少一项契约测试失败。
- [x] Favorites IndexedDB 的成功、事务失败回滚、合法/非法导入均有自动化覆盖。
- [x] 设置异步保存、语言/主题持久化、热键状态与错误具有语义断言。
- [x] Windows 手工报告记录：任意应用划词→主窗口翻译、剪贴板降级、SAPI 出声/停止、托盘、单实例；未执行项明确标注。（报告已明确 SAPI 可听性、原生托盘菜单和延迟的人工/外部条件边界。）
- [ ] 正常网络/常用模型下感知延迟 <3s、常驻内存 <150MB、空闲 CPU 接近 0% 均有测量方法和至少一次记录，不用静态推断代替。
- [x] `THIRD_PARTY_NOTICES` 可由一条命令重建，连续两次输出一致，CI 对 diff 非空失败。（本地连续两次 `pnpm notices:generate` 无漂移；Ubuntu CI 安装锁定的 cargo-about 0.9.2 后执行同一生成与 diff。）
- [ ] 全量本地门禁和三平台 CI 通过。

## Out of Scope

- 真实 LLM 密钥 CI、macOS/Linux 原生运行 E2E。
- 自动发布、签名、公证、校验和与商店上传。
- §14 其余治理 backlog。

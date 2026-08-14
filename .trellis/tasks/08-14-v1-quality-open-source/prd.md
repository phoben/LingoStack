# V1 质量与开源门禁

## Goal

用可重复的自动化与明确的 Windows 运行证据证明 V1 核心链路可用，并补齐显式要求的第三方许可证通知。

## Dependencies

- 依赖前三个 V1 子任务完成；本任务不替代其功能测试，只做最终覆盖与集成门禁。
- 依赖 `tauri-e2e-ci` 独立工作树完成 WebdriverIO Tauri runner、test-only feature gate、确定性 mock 与 Windows CI 基础，并在评审后进入本分支；本任务不与该工作树并行重建同一基础。

## Requirements

- 建立 Rust/TypeScript 跨 IPC 契约回归，重点覆盖配置默认值、枚举、Channel/event 形状。
- 补齐设置、收藏 DB/store/view、翻译词条与桌面状态的测试空白。
- 集成并验证 `tauri-e2e-ci` 工作树提供的 Windows WebdriverIO Tauri E2E 基础，使用 mock LLM/IPC 数据，不需要真实 API Key。
- 自动化覆盖文本翻译+tag、命名、设置保存、冲突恢复、收藏和可 mock 的划词/朗读状态链路。
- UIA 真实取词、SAPI 实际出声/停止、资源占用与感知延迟使用 Windows 手工清单记录。
- 确定性生成 `THIRD_PARTY_NOTICES`，覆盖 Rust 与生产前端依赖；CI 校验产物未漂移。
- 保留并验证现有 MIT、DCO、Dependabot、audit、Issue/PR 模板和三平台 CI。

## Acceptance Criteria

- [ ] Windows E2E 在无真实密钥下覆盖核心窗口链路且可在 CI 独立运行。
- [ ] Rust/TS IPC 镜像发生字段/枚举漂移时至少一项契约测试失败。
- [ ] Favorites IndexedDB 的成功、事务失败回滚、合法/非法导入均有自动化覆盖。
- [ ] 设置异步保存、语言/主题持久化、热键状态与错误具有语义断言。
- [ ] Windows 手工报告记录：任意应用划词→主窗口翻译、剪贴板降级、SAPI 出声/停止、托盘、单实例；未执行项明确标注。
- [ ] 正常网络/常用模型下感知延迟 <3s、常驻内存 <150MB、空闲 CPU 接近 0% 均有测量方法和至少一次记录，不用静态推断代替。
- [ ] `THIRD_PARTY_NOTICES` 可由一条命令重建，连续两次输出一致，CI 对 diff 非空失败。
- [ ] 全量本地门禁和三平台 CI 通过。

## Out of Scope

- 真实 LLM 密钥 CI、macOS/Linux 原生运行 E2E。
- 自动发布、签名、公证、校验和与商店上传。
- §14 其余治理 backlog。

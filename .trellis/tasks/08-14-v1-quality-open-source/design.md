# 技术设计：质量与开源门禁

## Contract tests

Rust 导出稳定的 JSON fixture（默认配置、旧配置迁移、流事件/热键状态），前端测试读取同一 fixture 或经 Tauri mock 验证镜像。测试不引入代码生成，但要让字段/枚举漂移从运行期提前到 CI。

IndexedDB 测试使用轻量 fake IndexedDB dev dependency；继续测试项目自己的 DB/store，而不是 mock 掉它。视图测试只 mock Tauri 边界并使用角色/ARIA 查询。

## Desktop E2E

基础 runner 与 CI 由 `tauri-e2e-ci` 独立工作树交付；该产出经评审并进入本分支前，本任务不修改其所有的 WDIO 配置、test-only plugin feature gate 或 E2E CI job。进入本分支后，再按 V1 最终 UI/IPC 契约补充场景与断言。

采用当前 Tauri 2 推荐的 WebdriverIO + `@wdio/tauri-service` embedded provider。测试插件只在 `e2e` Cargo feature/测试配置启用，不进入正式发布能力面。LLM、选区与 TTS 的不可控外部边界用服务能力 mock；至少保留一个真实 Tauri 启动、IPC、窗口路由烟雾链路。

Windows CI 建独立 E2E job：构建带 e2e feature 的二进制后运行 WDIO。失败时上传日志/截图；在稳定前不降低现有 lint/test/build 门禁。

## Native manual evidence

任务目录保存 Windows 验收记录，包含系统版本、命令/操作、预期、实际和时间。延迟从触发热键到首个可见译文计时；资源在驻留稳定 60 秒后从任务管理器/PowerShell 采样。UIA/SAPI 必须记录真实应用与听觉/停止结果。

## License notices

Rust 使用 `cargo-about` 配置 + 文本模板生成生产依赖许可证；前端使用当前锁定 pnpm 支持的 `pnpm licenses list --json --prod`，由仓库脚本归一化并合并。输出按生态、许可证、包名、版本稳定排序，不写绝对路径或时间戳。CI 重新生成并以 `git diff --exit-code -- THIRD_PARTY_NOTICES` 校验。

## Existing workflows

现有 CI/DCO/audit/Dependabot 只做必要接线和验证，不顺手重写。E2E 与 notices 增量加入，并保留三平台 Rust 矩阵。

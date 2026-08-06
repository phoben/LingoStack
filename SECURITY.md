# 安全策略

## 支持的版本

LingoStack 处于 V1 开发阶段，安全修复只针对最新发布版本。

## 报告漏洞

**请勿通过公开 Issue 报告安全漏洞。**

改为使用 GitHub 私密安全公告：

1. 进入仓库的 **Security → Advisories → New draft advisory**
2. 填写漏洞描述、复现步骤、影响范围
3. 提交后维护者会收到通知并与你在私密通道协作

**响应承诺**：

- 确认收悉：48 小时内
- 初步评估：5 个工作日内
- 修复发布：按严重程度排期（Critical 优先）

请勿在漏洞修复前公开讨论。

## API Key 安全承诺

LingoStack 是**零遥测**应用，不内置任何统计或崩溃上报：

- 用户的 LLM API Key 仅存储在本地配置文件（`<config_dir>/lingostack/config.json`，Unix 权限 `0600`），不会上传任何服务器。
- Key 不进日志、不进错误信息、不进崩溃报告——`ProviderConfig` 的 `Debug` 实现自动脱敏，Gemini（Key 在 URL query）的错误 body 亦经脱敏处理。
- Issue 模板与 PR 模板均明示「勿粘贴 API Key」。

## 依赖漏洞

- [Dependabot](https://github.com/dependabot) 持续监控 `cargo` / `npm` / `github-actions` 依赖，有漏洞会自动开 PR。
- `cargo audit` / `pnpm audit` 纳入 CI 门禁（见 `.github/workflows/audit.yml`），高危漏洞阻断合并。
- 依赖升级 PR 的评估与合并响应同样适用上述时效承诺。

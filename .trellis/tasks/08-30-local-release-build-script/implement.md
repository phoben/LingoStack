# 实施计划

## Phase 1 — 脚本与版本同步

- [x] 实现参数与交互菜单、仓库根解析、依赖与三处当前版本一致性检查。
- [x] 实现 SemVer 校验、限定范围写入、回读校验和写入失败回滚。
- [x] 实现 portable / installer 命令选择、日志 tee、退出码与耗时汇总。
- [x] 实现只识别本次新产物的路径发现。

## Phase 2 — 回归与调用入口

- [x] 增加临时 fixture PowerShell 测试，覆盖正常、边界和错误路径。
- [x] 在 `package.json` 增加 `release:local`。
- [x] 运行测试脚本、PowerShell Parser 检查、JSON 解析和 `git diff --check`。

## Phase 3 — 独立复核与真实构建

- [x] trellis-check 独立复核版本写入原子性、命令注入、退出码、旧产物误报与日志安全，并自修产物扫描、空数组、Tee 退出码和根级 JSON 定位缺陷。
- [x] 使用当前版本执行一次 `portable` release build：退出码 0，产物 `target/release/lingostack-app.exe`，完整日志 `target/release/logs/build-0.0.0-20260831-001812.log`。
- [x] `pnpm lint`、`pnpm build`、`pnpm test:production-isolation` 与 PowerShell 回归通过。
- [x] 同步发布脚本规范与使用命令；不提交、不归档，除非用户另行授权。

## Validation

```powershell
pwsh -NoProfile -File scripts/test-build-release.ps1
pnpm release:local -- -BuildType portable -Version 0.0.0
pnpm build
pnpm test:production-isolation
git diff --check
```

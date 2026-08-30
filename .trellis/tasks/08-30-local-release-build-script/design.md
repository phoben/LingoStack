# 本地发布构建设计

## 1. Entry and modes

新增 `scripts/build-release.ps1`，默认交互运行；同时提供 `-BuildType portable|installer`、`-Version <semver>` 供非交互调用。`-ProjectRoot` 和 `-NoBuild` 作为测试/诊断 seam，使测试可以在临时 fixture 中验证版本写入而不构建真实应用。

根 `package.json` 增加 `release:local` 入口，用户可执行：

```powershell
pnpm release:local
```

## 2. Version contract

版本源固定为：

- `package.json` 根级 `version`；
- `Cargo.toml` 的 `[workspace.package].version`；
- `src-tauri/tauri.conf.json` 根级 `version`。

脚本读取三处后必须完全相同才显示“当前版本”。新值接受 SemVer `major.minor.patch` 及合法 prerelease/build metadata。更新使用精确、限定范围的文本替换，保留文件其余格式；写入前缓存原文，任一写入或回读校验失败则恢复全部三份原文。构建失败不回退已经成功同步的新版本。

## 3. Build contract

| 用户选择 | 命令 | 预期产物 |
|----------|------|----------|
| portable | `pnpm tauri build --no-bundle` | `target/release/lingostack-app.exe` |
| installer | `pnpm tauri build --bundles nsis` | `target/release/bundle/nsis/*.exe` |

执行前记录开始时间和现有候选产物的时间/路径；成功后只接受本次构建期间新建或更新时间不早于开始时间的文件。外部命令的 stdout/stderr 同时输出到控制台和 `target/release/logs/build-<version>-<timestamp>.log`，并保留 `$LASTEXITCODE`。

## 4. Failure behavior

- 缺少 `pnpm`、缺版本文件、版本源不一致、输入格式错误：构建前失败，不改版本。
- 版本写入或回读失败：恢复原内容后失败。
- Tauri 构建失败：保留新版本，输出失败阶段、退出码与日志路径，不报告产物。
- 构建退出码为 0 但找不到本次产物：视为失败并返回脚本定义的非零码。
- 不打印环境变量、配置文件内容或任何 API Key。

## 5. Test strategy

新增 `scripts/test-build-release.ps1`，使用临时仓库 fixture 和 `-NoBuild` 验证三处版本同步、两种命令规划、非法 SemVer、版本不一致及退出码。真实验收以当前版本执行一次 portable release build，证明 Tauri CLI、前端构建、Rust release 构建和最终路径发现真实可用；不生成/发布真实新版本。

## 6. Change boundary

- `scripts/build-release.ps1`：交互、版本同步、构建、日志和结果汇总。
- `scripts/test-build-release.ps1`：无外部发布副作用的 PowerShell 回归。
- `package.json`：增加易发现的调用入口。
- `.trellis/spec/lingostack-app/backend/testing-strategy.md`：完成后补本地发布脚本的可执行契约。

不修改 Tauri bundle 配置、Rust 产品逻辑、CI、签名和 Git 工作流。

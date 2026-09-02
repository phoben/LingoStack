# 自动更新实施计划

## Phase 1 — 官方更新器与客户端状态机

- [x] 固定并安装 Tauri updater Rust 与前端依赖，注册插件并配置最小 production ACL；不引入 process 插件或自定义 NSIS hook。
- [x] 增加生产 endpoint、公钥和 Windows passive install mode；用 release config overlay 隔离更新产物签名，保持普通本地构建无需生产私钥。
- [x] 实现 Zustand update store：自动/手动检查、24 小时调度、稳定版比较、单任务守卫、下载进度、安装/重启和脱敏错误。
- [x] 为 store 增加确定性测试，mock 官方插件边界，覆盖自动失败静默、手动反馈、重复调用、迟到完成、下载失败和安装状态。

## Phase 2 — About 与标题栏体验

- [x] 将 About 占位改为完整检查/可用/下载/失败状态，展示版本、日期、纯文本说明、可信 GitHub 链接和进度。
- [x] 在标题栏主题按钮与系统窗控之间加入动态更新图标，复用同一更新动作并保持拖拽、键盘、可访问名称和 reduced-motion 契约。
- [x] 在 App 根部接入启动/周期检查与一次性轻量 Toast；补齐中英文文案。
- [x] 增加 RTL：About、TitleBar、App 调度/Toast、双入口并发守卫及 a11y；不依赖 Tailwind class 作为行为证据。

## Phase 3 — 可复现的签名发布链路

- [x] 新增 SemVer tag release workflow，校验标签与三处版本，设置 `production` environment approval 和最小 permissions。
- [x] 使用成熟官方 action/CLI 构建、签名 Windows x64 NSIS，创建公开 GitHub Release。
- [x] 实现并测试确定性发布 helper：定位本次 artifact/signature、生成 Tauri static JSON、上传版本路径、公开下载/验签、版本化 manifest、stable-last 覆盖和 CDN 刷新。
- [x] 为 helper 提供无真实网络/密钥 fixture，覆盖非法版本、缺签名、不可变对象不存在/相同/不同/探测失败/并发冲突、公开验签失败、stable 未触碰与重跑幂等。
- [x] 编写发布/密钥/误发恢复 runbook，列出 GitHub variables/secrets、COS/CAM/CDN 最小权限和人工门禁。

## Phase 4 — 质量门禁与分层验收

- [x] 运行前端 lint、Vitest、TypeScript/Vite build；运行 Rust fmt、clippy、workspace test/build。
- [x] 运行 production isolation、app E2E feature test、Windows Tauri E2E 与 release build；2026-09-02 修复既有断言与瞬时 `aria-busy` 选择器后，Windows 桌面 E2E 14/14 连续两次通过，release build 退出码为 0。
- [x] 重新生成并核对 `THIRD_PARTY_NOTICES`，运行 workflow/PowerShell/JSON 格式检查与 `git diff --check`。
- [ ] 在 DNS、TLS、COS、CDN 与测试签名密钥就绪后，从旧 Windows x64 NSIS 安装版完成一次真实 staging 更新：发现、下载、安装、重启、版本确认与配置保留。
- [ ] 真实 production 发布前完成签名私钥独立备份和恢复演练；未完成时不得发布 stable manifest。

## Validation Commands

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm test:production-isolation
pnpm test:e2e
pwsh -NoProfile -File scripts/test-build-release.ps1
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo test -p lingostack-app --features e2e
cargo build --workspace
cargo build --release -p lingostack-app
pnpm notices:generate
git diff --exit-code -- THIRD_PARTY_NOTICES
git diff --check
```

新增发布 helper 的专用测试命令在实现时写入 `package.json` 或脚本自身帮助，并纳入 CI；真实 COS/CDN/staging 命令只在用户配置外部资源并明确授权后执行。

## Rollback Points

- 客户端依赖/配置导致构建失败：移除 updater 装配与 capability，普通应用功能不受影响。
- UI 状态机异常：禁用自动调度与动态入口，恢复 About 占位，不触碰发布端。
- 发布 workflow 失败：stable manifest 未更新，修复后重跑；不得手工跳过签名/公开验证。
- 已发布坏版本：恢复上一健康 stable manifest 以止损，再发布更高修复版本；不启用降级比较器。

## Before `task.py start`

- [x] 用户审核并明确批准本 PRD、design 与 implement。
- [x] `implement.jsonl` / `check.jsonl` 含真实 spec/research 条目。
- [x] 实施阶段只修改仓库；COS、DNS、CDN、GitHub secrets 与生产密钥外部操作需另有明确授权。

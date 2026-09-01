# 版本更新与生产部署契约

## Scenario: 发布 Windows 稳定版并部署自动更新

### 1. Scope / Trigger

修改版本号、创建稳定版 Git tag、配置 GitHub Environment、更新发布 Secret/Variable、配置腾讯 COS/CDN/DNS、生成或轮换 updater 签名密钥、执行发布或处理坏版本时，必须遵守本契约，并同时阅读 [自动更新与稳定版发布契约](./auto-update-release.md) 与 [`docs/release-auto-update.md`](../../../../docs/release-auto-update.md)。

首期只发布 Windows x64 NSIS 稳定通道。portable、预发布版本、macOS 和 Linux 不进入自动更新通道。创建或修改 GitHub、腾讯云、DNS、证书、Tag、Release 等外部状态必须由获授权维护者执行；本契约不把代码修改授权扩大为生产发布授权。

### 2. Signatures

#### 2.1 版本与发布入口

```text
package.json                         version = X.Y.Z
Cargo.toml                          [workspace.package].version = X.Y.Z
src-tauri/tauri.conf.json           version = X.Y.Z
git tag                             vX.Y.Z
GitHub Actions environment          production
stable endpoint                     https://lsupdates.yugasoft.cn/channels/stable/latest.json
```

同步三处版本但不构建：

```powershell
pnpm release:local -- -BuildType installer -Version X.Y.Z -NoBuild
node scripts/release-manifest.mjs assert-version --version X.Y.Z
```

生成新的 Tauri updater 密钥时，必须在仓库外的受控临时目录执行：

```powershell
pnpm tauri signer generate --write-keys <仓库外私钥路径>
```

命令会输出公钥；私钥文件、密码和终端输出按生产秘密处理。禁止在仓库目录生成密钥。密钥生成后先完成 GitHub Environment 写入、离线加密备份和恢复演练，再删除未加密临时副本。

#### 2.2 GitHub `production` Environment

在 GitHub 仓库进入 `Settings → Environments → New environment`，创建名称严格为 `production` 的环境，配置 Required reviewers；条件允许时启用防止发布者自批。随后只在 `Settings → Environments → production` 下保存以下值：

| 名称                                 | 类型                 | 值与存放要求                                                         |
| ------------------------------------ | -------------------- | -------------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Environment Secret   | `signer generate` 产生的私钥**正文**，不是文件路径                   |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Environment Secret   | 私钥密码；与离线备份分开保管                                         |
| `TAURI_UPDATER_PUBLIC_KEY`           | Environment Secret   | 与私钥配对的完整公钥；工作流只注入临时 Tauri config                  |
| `COS_SECRET_ID`                      | Environment Secret   | 腾讯云 CAM 程序化访问凭据，只授权目标 bucket/prefix 与精确 CDN 刷新  |
| `COS_SECRET_KEY`                     | Environment Secret   | 对应 SecretKey，不与 SecretId 写入同一非加密记录                     |
| `COS_BUCKET`                         | Environment Variable | COS SDK 使用的完整 Bucket 名，例如包含 APPID 后缀的实际 bucket 名    |
| `COS_REGION`                         | Environment Variable | Bucket 的腾讯云地域代码，例如 `ap-guangzhou`，必须与实际 bucket 一致 |
| `COS_PREFIX`                         | Environment Variable | 该应用独占对象前缀，例如 `lingostack`；不使用首尾 `/`                |
| `CDN_DOMAIN`                         | Environment Variable | 公共更新域名；当前生产值为 `lsupdates.yugasoft.cn`，不含协议或路径   |

网页设置是权威方式。已登录正确仓库的 GitHub CLI 也可逐项交互写入，Secret 不放在命令行参数、shell 历史或 dotenv 文件中：

```powershell
Get-Content -Raw <仓库外私钥路径> | gh secret set TAURI_SIGNING_PRIVATE_KEY --env production
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --env production
gh secret set TAURI_UPDATER_PUBLIC_KEY --env production
gh secret set COS_SECRET_ID --env production
gh secret set COS_SECRET_KEY --env production

gh variable set COS_BUCKET --env production --body "<完整 bucket 名>"
gh variable set COS_REGION --env production --body "<地域代码>"
gh variable set COS_PREFIX --env production --body "lingostack"
gh variable set CDN_DOMAIN --env production --body "lsupdates.yugasoft.cn"
```

禁止把上述 Secret 放入 Repository Secret、`.env*`、`VITE_*`、源码、`tauri.conf.json`、日志、Actions artifact、Issue 或 PR。Repository Secret 绕过了本流程的 production 审批边界；`VITE_*` 会进入前端 bundle。当前工作流把公钥也放在 Environment Secret 中，是为了让生产信任根只在获批 job 内生成临时配置。

#### 2.3 腾讯 COS、CDN 与域名

一次性生产配置由腾讯云/DNS 管理员完成：

1. 创建或选择**私有读写** COS bucket，记录其完整 Bucket 名与地域；启用版本控制，并为历史 stable manifest 保留可恢复版本。
2. 创建独立 CAM 程序化身份。COS 权限仅覆盖 `COS_PREFIX` 下的 `HeadObject`、`GetObject`、`PutObject`。CDN `PurgePathCache` 是腾讯云 CAM 的操作级接口，策略必须使用 `resource: "*"`；只授予这一项 CDN action，不授予域名配置、bucket 管理、删除或账户管理权限。
3. 将 `lsupdates.yugasoft.cn` 接入中国大陆 CDN，配置已备案域名、有效 TLS 证书、CNAME 和私有 COS 回源鉴权。客户端访问固定 HTTPS URL，不使用临时签名 URL。
4. 缓存规则：`releases/**` 与 `manifests/<version>/**` 长缓存且不可变；`channels/stable/latest.json` 使用 `no-cache` 或极短 TTL，并允许发布后只刷新这一条路径。
5. 将真实 `COS_BUCKET`、`COS_REGION`、`COS_PREFIX` 写入 GitHub `production` Variables，将新 CAM SecretId/SecretKey 写入同环境 Secrets；不把云凭据写入仓库或维护文档。

`.github/workflows/release.yml` 必须通过 `${{ vars.CDN_DOMAIN }}` 注入域名，当前值为 `lsupdates.yugasoft.cn`。更换 Variable 本身不能迁移已安装客户端：仍必须同步客户端 endpoint、DNS/TLS/CDN 配置、ADR/Spec，并重新做旧版客户端兼容评估。

#### 2.4 COS 对象布局

```text
<COS_PREFIX>/releases/<version>/windows-x86_64/<installer>.exe
<COS_PREFIX>/releases/<version>/windows-x86_64/<installer>.exe.sig
<COS_PREFIX>/manifests/<version>/latest.json
<COS_PREFIX>/channels/stable/latest.json
```

前三类对象不可变；`channels/stable/latest.json` 是唯一可变对象。CDN 对外 URL 不暴露 `COS_PREFIX`，因此 CDN 源站路径映射必须让以下公共路径对应到上述对象：

```text
https://lsupdates.yugasoft.cn/releases/<version>/windows-x86_64/<installer>.exe
https://lsupdates.yugasoft.cn/releases/<version>/windows-x86_64/<installer>.exe.sig
https://lsupdates.yugasoft.cn/manifests/<version>/latest.json
https://lsupdates.yugasoft.cn/channels/stable/latest.json
```

### 3. Contracts

#### 3.1 首次上线门禁

- `production` Environment 已有 reviewer，且五个 Secrets、四个 Variables 均已配置；任何 Secret 都不能在日志中打印或通过 artifact 传递。
- updater 私钥有一份独立离线加密备份；安全记录只保存公钥指纹、负责人、备份位置类别和最近恢复演练日期，不保存私钥或密码。
- DNS、TLS、CNAME、私有回源和缓存规则均通过外部验收。域名未解析、证书不可信或公开端点不可读时不得发布 stable。
- 生产工作流的 `preflight` 不绑定 `production`，只校验 Tag 与仓库版本；只有通过预检后的 publish job 才等待人工批准并获得 Secrets。

#### 3.2 每次稳定版发布

1. 在正常开发提交中同步三处版本到同一无预发布后缀的 `X.Y.Z`，更新面向用户的变更说明，并完成本 Spec 的本地门禁。
2. 审核待发布 commit 后创建精确 Tag `vX.Y.Z`。Tag 必须指向含相同三处版本的 commit；创建和 push commit/Tag 均需明确 Git 授权。
3. `preflight` 运行 `assert-version`，不接触 production Secret。失败时修正源码并使用新版本/新 Tag，不移动已公开使用的 Tag。
4. 获授权 reviewer 审核 preflight 与本次版本后批准 `production` job。job 用临时 updater config 签名构建 Windows NSIS。
5. 工作流按固定顺序发布：不可变 installer/`.sig` → CDN 下载与 Minisign 真验签 → GitHub Release → 不可变 version manifest → stable manifest 最后写入 → 只刷新 stable CDN 路径 → 公开回读版本。
6. 发布后独立检查 stable manifest、不可变 URL、缓存头、GitHub Release，并从上一 Windows NSIS 安装版执行“发现 → 用户点击立即更新 → 下载/安装 → 自动启动新版本 → 配置保留”。

GitHub Release 是公开镜像与变更日志，不是客户端权威更新源。仅当 production job 和手工外部验收都有证据时，才能声明生产自动更新链路通过。

#### 3.3 密钥与坏版本恢复

- 私钥常规轮换必须先发布由旧私钥签名、同时内置新公钥的桥接版本；不得直接替换客户端信任根。
- 私钥丢失或泄露时立即停止自动发布，保留证据并改走用户手动下载安装；没有旧私钥时不能靠更新服务声明恢复现有客户端信任。
- 坏 stable 版本先从 COS 版本历史恢复上一健康 manifest 并刷新唯一 stable 路径，以保护尚未升级的客户端；随后发布更高版本修复。已升级客户端不自动降级。
- stable 已写入但 purge/公开回读失败属于部分发布：先读取 COS 当前版本、CDN 返回与 GitHub Release 状态，再按现场事实恢复；禁止盲目重跑或覆写同版本不可变对象。

### 4. Validation & Error Matrix

| 条件                                          | 必须结果                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| 三处版本不一致、Tag 不匹配或含预发布后缀      | preflight 失败，不进入 production                                      |
| Environment Secret/Variable 缺失              | production job 失败关闭，不构建或不写 stable                           |
| Secret 出现在仓库、`VITE_*`、日志或 artifact  | 阻断发布，撤销/轮换泄露值并清理历史后重新审计                          |
| COS 探测非 404、对象同名不同字节或 412 后不同 | 非零退出，不覆盖不可变对象，不写 stable                                |
| DNS/TLS/CDN 回源或公开 Minisign 验签失败      | 不创建后续 GitHub Release/version manifest/stable                      |
| GitHub Release 或 version manifest 失败       | stable 保持原版本                                                      |
| stable 写入后 purge/公开回读失败              | workflow 失败并按部分发布处理，先取证再恢复                            |
| CAM 权限过宽                                  | 首次发布门禁不通过；收紧为 prefix 对象操作与精确 CDN 刷新              |
| 私钥备份未恢复演练或保管信息不完整            | 不批准首次 production 发布                                             |
| 已发布版本有严重缺陷                          | 恢复上一 healthy stable 保护未升级者，再发更高版本；不降级已升级客户端 |
| 私钥丢失或泄露                                | 停止自动发布，走手动重装与安全响应                                     |

### 5. Good / Base / Bad Cases

- **Good**：三处版本与 Tag 一致；reviewer 批准后才注入生产秘密；不可变对象逐个验证，公开 CDN 真验签通过，stable 最后写入；旧安装版完成更新、重启和配置保留验收。
- **Base**：本地版本同步、测试和 release build 全过，但尚未配置/运行 production job。只能声明“发布逻辑与本地构建通过”，不得声明 COS/CDN 或真实自动更新可用。
- **Bad**：把私钥放进 `.env` 或 Repository Secret；用长期管理员云密钥；Tag 后再改版本；先覆盖 stable 再验签；同版本覆盖 artifact；仅凭 Actions 绿灯宣称用户端更新通过。

### 6. Tests Required

版本更新和 workflow/script 变更至少执行：

```powershell
node scripts/release-manifest.mjs assert-version --version X.Y.Z
pnpm lint
pnpm test
pnpm build
pnpm test:production-isolation
pnpm test:release
pwsh -NoProfile -File scripts/test-build-release.ps1
pnpm notices:generate
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo build --release -p lingostack-app
git diff --check
```

仅修改 Spec 时，至少运行目标 Markdown 格式检查、链接/JSONL 引用检查与 `git diff --check`；不能用文档门禁替代正式发布门禁。

首次配置或每次真实发布还要保存以下外部证据，但不得保存 Secret：

```powershell
Resolve-DnsName lsupdates.yugasoft.cn
Invoke-WebRequest -Method Head https://lsupdates.yugasoft.cn/channels/stable/latest.json
Invoke-RestMethod https://lsupdates.yugasoft.cn/channels/stable/latest.json
```

同时记录 GitHub production approval/run URL、公开 artifact 与 manifest URL、返回版本、TLS/缓存结果，以及旧 NSIS → 新版本的人工验收结果。未执行的外部检查明确标记“待生产验收”。

### 7. Wrong vs Correct

#### Wrong

```text
私钥写进仓库 .env
→ 管理员 COS 密钥放 Repository Secret
→ 先 push Tag 再改版本
→ 覆盖 stable
→ 只看 workflow 绿灯即宣布发布成功
```

#### Correct

```text
仓库外生成签名密钥 + 离线加密备份/恢复演练
→ GitHub production Environment 保存 Secrets/Variables并配置 reviewer
→ 同步三处版本并通过本地门禁
→ push 精确 vX.Y.Z Tag
→ 无秘密 preflight
→ 人工批准 production
→ 不可变发布 + CDN 真验签 + GitHub Release
→ stable 最后写入并公开回读
→ 旧版 Windows NSIS 端到端人工验收
```

# 自动更新人工部署指南（Windows 稳定版）

本文是给仓库维护者执行的操作手册：说明哪些事情必须在 GitHub、腾讯云和 DNS
控制台人工完成，以及每次稳定版发布时需要人工确认的步骤。它不替代
[版本更新与生产部署契约](../.trellis/spec/lingostack-app/backend/version-release-deployment.md)
和 [发布运行手册](./release-auto-update.md)：前者定义可执行约束，后者说明流水线
如何保证不可变发布与验签。

适用范围仅为 Windows x64 NSIS 稳定通道。客户端唯一权威更新地址是
`https://lsupdates.gridfriend.cn/channels/stable/latest.json`；GitHub Releases 只是
公开下载镜像和变更日志，不是应用内更新源。

> 安全边界：以下操作会创建或修改外部生产状态。仅由获授权维护者执行；不要把
> 私钥、密码、COS 凭据或其截图、终端输出提交到仓库、Issue、PR、日志或 artifact。

## 0. 部署前信息清单

先准备以下信息，但不要把秘密写入本仓库。

| 项目               | 维护者需要准备的值                           | 存放位置                                                 |
| ------------------ | -------------------------------------------- | -------------------------------------------------------- |
| updater 私钥与密码 | Tauri signer 生成的一对私钥正文和密码        | GitHub `production` Environment Secret；独立离线加密备份 |
| updater 公钥       | 与该私钥对应的完整公钥正文                   | GitHub `production` Environment Secret                   |
| COS 发布身份       | 最小权限 CAM 的 SecretId / SecretKey         | GitHub `production` Environment Secret                   |
| COS 位置           | Bucket 全名、地域代码、应用独占 Prefix       | GitHub `production` Environment Variable                 |
| 公共域名           | `lsupdates.gridfriend.cn`                    | DNS/CDN/TLS 配置；当前 workflow 固定值                   |
| 安全记录           | 公钥指纹、负责人、备份位置类别、恢复演练日期 | 仓库外受控安全记录，且不含私钥/密码                      |

## 1. 生成并保管 Tauri updater 签名密钥

在仓库外、受控且可清理的目录生成密钥。不要在仓库根目录、临时同步盘或 `.env` 中
生成或保存它。

```powershell
pnpm tauri signer generate --write-keys <仓库外私钥路径>
```

1. 为私钥设置强密码，记录命令输出的完整公钥；私钥和密码都按生产 Secret 处理。
2. 将私钥文件和密码分别放入独立的、受控的离线加密备份；至少避免“同一云盘同一
   密码库条目”这样的单点丢失。
3. 计算并记录公钥指纹、密钥负责人、备份位置类别和演练日期；记录中不得含私钥、
   密码或 COS 凭据。
4. 用隔离环境从离线备份恢复密钥，并确认它能读取且与记录的公钥匹配。首次 stable
   发布前必须完成并记录这次恢复演练。
5. 确认无加密临时副本后，删除生成时的临时文件；删除前先核实备份和恢复演练均成功。

不要直接更换已发布客户端信任的公钥。例行轮换必须先发一个仍由旧私钥签名、但内置
新公钥的桥接版本。旧私钥丢失或泄露时，立即停止自动发布并改用 GitHub Release
手动安装；不能声称旧客户端可被自动、安全地迁移。

## 2. 配置 GitHub `production` Environment

在目标 GitHub 仓库依次打开 `Settings → Environments → New environment`，创建名称
严格为 `production` 的 Environment。

1. 在该 Environment 设置 **Required reviewers**；有条件时启用禁止发布者自批的策略。
   这样 `preflight` 可以先无秘密运行，只有 reviewer 批准发布 job 后才注入生产值。
2. 在 `Settings → Environments → production → Environment secrets` 创建下列五项。
3. 在同一页的 `Environment variables` 创建下列三项。不要将它们误放到 repository
   级别；repository Secret 会绕过本流程的 Environment 审批边界。

| 名称                                 | 类型                 | 应填内容                                          |
| ------------------------------------ | -------------------- | ------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Environment Secret   | 私钥**完整正文**，不是文件路径                    |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Environment Secret   | 对应私钥密码                                      |
| `TAURI_UPDATER_PUBLIC_KEY`           | Environment Secret   | 对应的完整公钥正文                                |
| `COS_SECRET_ID`                      | Environment Secret   | 受限 CAM 程序化身份的 SecretId                    |
| `COS_SECRET_KEY`                     | Environment Secret   | 与该 SecretId 配对的 SecretKey                    |
| `COS_BUCKET`                         | Environment Variable | COS SDK 所需的完整 Bucket 名（含实际 APPID 后缀） |
| `COS_REGION`                         | Environment Variable | Bucket 的腾讯云地域代码，例如 `ap-guangzhou`      |
| `COS_PREFIX`                         | Environment Variable | 应用独占路径前缀，例如 `lingostack`，不含首尾 `/` |

已登录正确仓库的维护者也可以通过 GitHub CLI 交互设置。Secret 不要出现在命令行参数、
PowerShell 历史或 dotenv 文件中：

```powershell
Get-Content -Raw <仓库外私钥路径> | gh secret set TAURI_SIGNING_PRIVATE_KEY --env production
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --env production
gh secret set TAURI_UPDATER_PUBLIC_KEY --env production
gh secret set COS_SECRET_ID --env production
gh secret set COS_SECRET_KEY --env production

gh variable set COS_BUCKET --env production --body "<完整 bucket 名>"
gh variable set COS_REGION --env production --body "<地域代码>"
gh variable set COS_PREFIX --env production --body "lingostack"
```

严禁将任一 Secret 放到 `VITE_*`、`.env*`、源码、`tauri.conf.json`、Repository Secret、
Actions artifact 或日志中。`VITE_*` 会被打进前端 bundle；当前 workflow 把公钥也作为
Environment Secret，仅用于获批 job 内的临时 Tauri 配置。

## 3. 一次性配置腾讯 COS、CAM、CDN、DNS 与 TLS

以下由腾讯云和域名管理员在控制台完成；具体控制台名称可能随腾讯云界面变化，但结果
必须满足本节的可观察条件。

1. 创建或选择一个**私有** COS Bucket，确定地域，开启版本控制，并保留 stable
   manifest 的历史版本。记录完整 Bucket 名和地域，写入上述 Variables。
2. 创建独立 CAM 程序化身份。它只应拥有 `COS_PREFIX` 范围内的 Head/Get/Put、必要
   multipart 操作，以及精确刷新
   `https://lsupdates.gridfriend.cn/channels/stable/latest.json` 的 CDN 权限；不得授予
   Bucket 管理、宽泛删除或账号管理权限。将其 SecretId/SecretKey 仅写入
   `production` Environment Secrets。
3. 将已备案域名 `lsupdates.gridfriend.cn` 接入中国大陆 CDN，以私有 COS 为源站并配置
   回源鉴权。设置 DNS CNAME 指向 CDN 分配的目标；客户端和外部用户仅访问 HTTPS CDN
   地址，不能访问带有效期查询签名的下载链接。
4. 为该 CDN 域名绑定有效 TLS 证书，确认 HTTPS 的证书链和主机名均正确。
5. 配置 CDN 源站路径映射，使公共 URL 不暴露 `COS_PREFIX`，但仍准确对应 COS 对象：

   ```text
   <COS_PREFIX>/releases/<version>/windows-x86_64/<installer>.exe
   <COS_PREFIX>/releases/<version>/windows-x86_64/<installer>.exe.sig
   <COS_PREFIX>/manifests/<version>/latest.json
   <COS_PREFIX>/channels/stable/latest.json
   ```

6. 配置缓存规则：`releases/**` 和 `manifests/<version>/**` 使用长缓存、不可变；
   `channels/stable/latest.json` 使用 `no-cache` 或极短 TTL。发布后只允许刷新 stable
   路径，不能用大范围刷新掩盖版本错误。

`CDN_DOMAIN` 目前固定为 `lsupdates.gridfriend.cn`，不是 GitHub Variable。若需变更域名，
必须同时改 workflow、客户端 endpoint、DNS/TLS/CDN 配置和相关 ADR/Spec，并重新验证
已安装旧客户端的兼容性。

## 4. 首次启用验收（尚未有 stable 时）

先准备一份由本 `production` updater 私钥签名的新版本和一台安装旧 Windows x64 NSIS
版本的测试机。测试签名密钥无法验证该客户端内置的 production 公钥，不能替代这项
验收。完成下列检查后，才可宣称生产自动更新链路可用。

- [ ] `production` 有 Required reviewers，且全部 5 个 Secrets、3 个 Variables 位于该
      Environment；无仓库级重复 Secret。
- [ ] 私钥的离线加密备份与恢复演练已经完成，安全记录不含秘密。
- [ ] DNS 解析、TLS、CDN 私有回源、对象路径映射和缓存规则均已由管理员核验。
- [ ] 发布 `vX.Y.Z` 后，Actions 的无秘密 `preflight` 成功，随后有 reviewer 对
      `production` 发布 job 的批准记录。
- [ ] 公共 stable manifest、`.exe`、`.exe.sig` 和 GitHub Release 都可访问；manifest
      的版本、URL、签名与本次发布一致。
- [ ] 旧安装版发现更新但不自动下载；点击“立即更新”后下载、NSIS 安装、自动启动新版本，
      且原有配置保留。

可在不显示 Secret 的终端中保留以下外部证据：

```powershell
Resolve-DnsName lsupdates.gridfriend.cn
Invoke-WebRequest -Method Head https://lsupdates.gridfriend.cn/channels/stable/latest.json
Invoke-RestMethod https://lsupdates.gridfriend.cn/channels/stable/latest.json
```

同时保存 Actions run URL、production 批准记录、公开 URL、返回版本和缓存/TLS 结果。未
进行上述真实外部检查时，只能说本地发布逻辑通过，不能说自动更新已上线。

## 5. 每次稳定版的人工作业

1. 在待发布 commit 中将 `package.json`、根 `Cargo.toml`、`src-tauri/tauri.conf.json`
   同步为同一个无预发布后缀的 `X.Y.Z`，写好面向用户的变更说明，并完成仓库发布门禁。
2. 审核 commit 后创建并推送精确 Tag `vX.Y.Z`。不要在 Tag 后改版本，也不要移动已公开
   使用的 Tag；若 `preflight` 失败，修正后使用新的版本和新 Tag。
3. 查看无秘密的 `preflight` 结果。它应验证 Tag 与三处版本一致，且不读取 production
   Secret。
4. 获授权 reviewer 审核版本和预检，再批准 `production` job。不要通过临时降低
   Environment 保护或复制 Secret 到仓库级别来绕过审批。
5. 等待 workflow 完整结束。它必须依序完成不可变 installer/签名上传、公开 CDN 下载和
   Minisign 验签、GitHub Release、版本化 manifest，最后才写 stable manifest 并刷新其
   单一路径。
6. 发布后独立检查 stable manifest、不可变 artifact/签名 URL、缓存头和 GitHub Release；
   从旧 NSIS 安装版实际走完“发现 → 用户点击 → 下载 → 安装 → 自动启动 → 配置保留”。

## 6. 故障与恢复操作

| 情况                                         | 人工动作                                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| preflight 或 production job 在 stable 前失败 | 不手工写 stable；修复后重跑，并先确认同版本不可变对象逐字节一致。                                                            |
| 公共 CDN 验签、DNS、TLS 或回源失败           | 不批准或停止发布；修复基础设施后重新验证公开 URL，不能跳过验签。                                                             |
| stable 已写入但 purge/公开回读失败           | 先读取 COS 当前对象版本、CDN 返回内容和 GitHub Release 状态，保留证据后再决定恢复；禁止盲目重跑或覆盖同版本不可变对象。      |
| 已发布坏 stable                              | 从 COS 版本历史恢复上一健康 stable manifest，仅刷新 stable CDN 路径；随后发布更高版本修复。已升级客户端不会自动降级。        |
| 私钥丢失/疑似泄露                            | 立即停止自动发布，保留事件证据、轮换云凭据并走安全响应；对现有用户提供 GitHub Release 手动重装。没有旧私钥不得承诺自动恢复。 |
| 例行密钥轮换                                 | 先发由旧私钥签名且内置新公钥的桥接版本；桥接覆盖足够用户后，才切换新私钥。                                                   |

## 7. 发布前最终勾选清单

- [ ] 本次仅为 Windows x64 NSIS stable，Tag 格式是 `vX.Y.Z`。
- [ ] 三处版本与 Tag 完全一致，且已通过本地发布门禁。
- [ ] `production` reviewer 已配置，本次批准由授权 reviewer 完成。
- [ ] 所有 Secret/Variable 位于 `production`，没有写入代码、`.env*`、Vite 或日志。
- [ ] CAM 权限仅限 Bucket Prefix 与精确 stable CDN 刷新；COS 开启版本控制。
- [ ] DNS、TLS、私有回源与缓存规则已核验，stable URL 可从公开网络读取。
- [ ] 私钥离线备份和恢复演练有效，安全记录更新但不含秘密。
- [ ] workflow 在 stable 写入前已完成公开 CDN 验签和 GitHub Release。
- [ ] stable 写入后已公开回读版本，并完成旧 NSIS 到新版本的真实人工更新验收。

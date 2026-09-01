# 自动更新事实调研

调研时间：2026-08-31。本文只记录仓库事实、官方能力与由此得出的架构推断；产品策略仍由访谈确认。

## 仓库现状

- Tauri lock 版本为 2.11.5；应用尚未依赖 updater、process 或 notification 插件，也未配置 updater endpoint、公钥或 ACL。
- `src-tauri/tauri.conf.json` 当前只有主窗口，关闭主窗口会隐藏到托盘；React 顶层集中挂载全局 `sonner` toast。
- About 页面已有“检查更新（即将支持）”入口，可作为手动检查的既有产品位置。
- 当前 `0.0.2` 版本由三处同步维护；`scripts/build-release.ps1` 只构建 Windows portable/NSIS 本地产物，不签名、不上传、不生成更新索引。
- GitHub Actions 当前覆盖 CI、audit、DCO，没有 release workflow；Windows Tauri E2E 已有真实桌面运行基础，但没有更新生命周期 fixture。

## 成熟方案

首选 Tauri 官方 `tauri-plugin-updater`，配合国内 HTTPS 对象存储/CDN 托管静态更新索引及签名产物。

- 官方插件通过构建期私钥为更新产物签名，客户端内置公钥并在安装前验签。
- 静态 `latest.json` 可按平台指向对象存储中的不可变版本产物；客户端支持检查、分离下载与安装，并报告下载进度。
- Windows 开始安装后应用会退出；macOS/Linux 安装后需显式 relaunch 或等用户下次启动。因此“后台检查/下载，用户确认后安装并重启”是跨平台可表达的共同体验，“无交互静默安装并强制重启”不是稳妥的共同契约。
- CrabNebula Cloud 等托管更新服务可提供动态频道/策略，但不是官方插件的必需依赖；在“国内网络优先、对象存储可控”的首期目标下收益不足。

## 推荐发布顺序

1. CI 构建并签名更新产物。
2. 上传不可变的版本化产物与签名文件。
3. 校验所有目标平台产物均可下载且签名齐全。
4. 最后原子发布或切换 `stable/latest.json`，并为索引设置短缓存、为版本产物设置长期不可变缓存。
5. 客户端只通过 HTTPS 获取索引与产物；签名失败时拒绝安装并保留当前版本。

Tauri 多 endpoint 只会在前一个 endpoint 返回非 2xx 时尝试后一个；“可访问但内容过期”的主源不会自动切到镜像。因此双源降级不能只依赖 endpoint 顺序，必须明确索引一致性与健康策略。

## 国内对象存储比较

- 运行时保持 provider-neutral：客户端只认识 HTTPS `latest.json` 与签名产物 URL，不暴露或依赖具体云厂商协议。
- 阿里云 OSS 与腾讯云 COS 均支持公开 HTTPS 对象、版本控制、对象级缓存元数据和中国内地 CDN；启用自定义中国内地 CDN 域名均涉及备案。
- 阿里云提供官方 GitHub Action，可用 GitHub Actions OIDC 换取短期 RAM 凭据；production job 不必长期保存云访问密钥。当前核实到的腾讯 COS GitHub Actions 路径主要使用受限 SecretId/SecretKey，虽可用但密钥治理成本更高。
- 推荐首发部署采用阿里云 OSS；若尚无备案域名，可先用 OSS 默认 HTTPS endpoint 实测发布，备案完成后只切换 endpoint 域名，不改变客户端更新协议。
- 费用不能只比较存储单价，还包含下载流量、请求和 CDN 回源；最终上线前应按 Windows 安装包大小与预估月更新次数计算预算。

产品决策：首发部署改用腾讯云 COS。保留上述 provider-neutral 运行时边界；CI 使用受限 CAM 身份访问指定 Bucket/前缀，长期密钥仅存放在 GitHub `production` environment secrets，后续若核实可用的短期身份联邦再替换凭据获取方式。

## 官方来源

- [Tauri Updater 插件](https://v2.tauri.app/plugin/updater/)
- [Tauri Updater JavaScript API](https://v2.tauri.app/reference/javascript/updater/)
- [Tauri Updater 版本记录](https://tauri.app/release/updater/all-versions/)
- [Tauri GitHub 发布流水线](https://v2.tauri.app/distribute/pipelines/github/)
- [CrabNebula Cloud Tauri 自动更新](https://docs.crabnebula.dev/cloud/auto-updates/tauri/)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [GitHub Actions 安全使用](https://docs.github.com/en/actions/reference/security/secure-use?learn=getting_started&learnProduct=actions)
- [阿里云 OSS 自定义域名](https://help.aliyun.com/zh/oss/user-guide/access-buckets-via-custom-domain-names)
- [阿里云 CDN 接入域名](https://help.aliyun.com/zh/cdn/add-a-domain-name)
- [阿里云官方 GitHub Actions 凭据 Action](https://github.com/aliyun/configure-aliyun-credentials-action)
- [GitHub Actions OIDC](https://docs.github.com/zh/actions/reference/security/oidc)
- [腾讯云 COS 公有访问](https://cloud.tencent.com/document/product/436/45228)
- [腾讯云 COS STS 临时密钥](https://cloud.tencent.cn/document/product/436/14048)

## 更新域名现状

2026-08-31 只读验证时，原候选域名 `lsupdates.gridfriend.cn` 在本机解析器、Cloudflare `1.1.1.1` 与 Google `8.8.8.8` 上均返回 NXDOMAIN。该域名未投入客户端发布，随后被正式域名取代。

2026-09-01 生产域名确定为 `lsupdates.yugasoft.cn`，CNAME 指向 `lsupdates.yugasoft.cn.cdn.dnsv1.com`。公网实测确认：Cloudflare/Google DNS 均返回该 CNAME；HTTPS 证书有效；HTTP 以 301 保留完整路径跳转 HTTPS；TLS 1.0 被拒绝而 TLS 1.2 可连接；私有 COS 的 CDN 服务授权和回源鉴权生效；`channels`、`releases`、`manifests` 三类公共路径分别重写到 `lingostack/` 前缀。stable manifest 尚未发布，因此 `/channels/stable/latest.json` 当前预期返回 COS `NoSuchKey`；只有首次正式发布后返回 200 JSON 才能完成端到端验收。

## 签名密钥与坏版本恢复

- Tauri Updater 的签名验证不可关闭；当前官方实现以单个 active 公钥验签，没有现成 key ring。私钥丢失后，已安装客户端无法再信任由新私钥签名的更新。
- 计划内轮换需要先发布仍由旧私钥签名、但内置新公钥的桥接版本；随后版本再切换到新私钥。若旧私钥已丢失或泄露，只能通过官网、管理员或其他外部渠道重新安装新的信任根。
- 默认版本比较只接受远端版本高于当前版本。把稳定索引指回低版本只能阻止尚未更新的客户端继续获取坏版，不能让已更新客户端自动降级。
- 若不在首版预置受控降级逻辑，坏版本的稳妥恢复方式是立即恢复最后健康索引以止损，并尽快发布版本号更高的修复版本。
- 私钥与密码应保存在两个相互独立、可审计且完成恢复演练的机密位置；CI 只在 production 审批后通过环境变量临时注入，禁止进入仓库、`.env`、产物或日志。

## Windows 安装与重启

Tauri v2 updater 在 Windows NSIS `passive` 模式下默认启用安装后重启：下载完成并启动安装器时当前应用自动退出，官方安装器使用 `/P /UPDATE /R` 显示短进度，安装成功后重新启动新版本。JS 不能依赖 `install()` / `downloadAndInstall()` 之后再调用 `process.relaunch()`，本功能也不需要自定义 NSIS hook；真实行为必须以已安装 NSIS 旧版本到新版本的 Windows 验收为证据。

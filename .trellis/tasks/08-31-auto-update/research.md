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

## 官方来源

- [Tauri Updater 插件](https://v2.tauri.app/plugin/updater/)
- [Tauri Updater JavaScript API](https://v2.tauri.app/reference/javascript/updater/)
- [Tauri Updater 版本记录](https://tauri.app/release/updater/all-versions/)
- [Tauri GitHub 发布流水线](https://v2.tauri.app/distribute/pipelines/github/)
- [CrabNebula Cloud Tauri 自动更新](https://docs.crabnebula.dev/cloud/auto-updates/tauri/)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [GitHub Actions 安全使用](https://docs.github.com/en/actions/reference/security/secure-use?learn=getting_started&learnProduct=actions)

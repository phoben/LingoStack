# 自动更新技术设计

## 1. Architecture

采用官方 `tauri-plugin-updater` 作为检查、下载、签名验证、安装与 Windows 重启边界。应用不新增 process 插件、自定义更新协议、后端下载器或独立更新服务。

```text
App / About / TitleBar
        ↓
Zustand update-store（唯一任务与状态机）
        ↓
@tauri-apps/plugin-updater + process
        ↓
https://lsupdates.yugasoft.cn/channels/stable/latest.json
        ↓
CDN → 私有 COS 源桶中的签名 NSIS 更新产物
```

Rust 应用层只负责注册 updater 插件；前端 store 直接调用官方插件 API。生产 capability 仅向 `main` 窗口开放必要的 check/download/install 权限。`lingostack-core` 与其余能力 crate 不承担更新职责。

生产配置内置单一公钥、稳定 endpoint 和 Windows passive install mode。普通本地构建不应要求生产私钥：更新产物生成通过发布 config overlay 仅在 production release job 中开启，避免破坏现有 `release:local` 验证流程。

## 2. Client State Model

新增 `update-store`，使用 Zustand 选择器消费，持有以下瞬时状态：

```text
idle → checking → available → downloading → installing → restarting
          ↘ idle        ↘ error ───────────────↗ retry
```

- `checking` 记录来源 `automatic | manual`，决定失败是否提示。
- `available` 保存官方 Update handle、版本、发布日期、纯文本 notes 与可信 GitHub URL。
- `downloading` 保存累计字节、可选总字节和归一化百分比；重复入口复用同一 in-flight Promise。
- `installing/restarting` 禁用所有更新入口，避免并发安装。
- `error` 只保留本地化、脱敏的用户文案；官方对象和错误响应不写入持久化存储。

自动调度由 App 根部 effect 启动：首帧初始化后检查一次，并注册 24 小时 timer；组件卸载时清理。发现可用更新后暂停 timer。手动检查可随时触发，但遇到现有任务时返回该任务状态而非发起第二次请求。

## 3. UX Boundaries

- `App` 监听 store 的“首次发现该版本”事件并调用现有全局 Toast；自动检查错误不 Toast，手动检查与更新失败 Toast。
- `AboutView` 是完整状态主界面：检查、最新版、可用版本、发布日期、纯文本摘要、GitHub 链接、立即更新、下载进度与失败重试。
- `TitleBar` 在主题按钮与窗控分隔条之间按状态渲染图标按钮；父容器继续阻止 mousedown 冒泡以避免误拖拽。可用时为“立即更新”，下载中为活动状态，安装中不可重复操作。
- 图标使用现有语义 token、`title`、本地化 `aria-label`、focus-visible 与 reduced-motion 约定；不新增第二套 Tooltip 或按钮系统。
- 用户点击更新后不切页。若正在翻译，下载继续；下载完成后按已授权流程安装和重启，流式结果不会被额外持久化。
- Windows NSIS passive 安装由官方 updater 传入 `/P /UPDATE /R`：启动安装器后当前进程退出，安装器显示短进度，成功后自动启动新版本。JS 不调用 `process.relaunch()`，也不自定义 NSIS hook。

## 4. Static Update Contract

稳定索引采用 Tauri 静态 JSON schema，至少包含 `version`、`notes`、`pub_date` 和 Windows x64 platform 的 `url`、`signature`。签名字段写入 `.sig` 的文本内容，不是签名文件 URL。

```text
releases/<semver>/windows-x86_64/<artifact>.exe
releases/<semver>/windows-x86_64/<artifact>.exe.sig
manifests/<semver>/latest.json
channels/stable/latest.json
```

版本产物和版本化 manifest 使用不可变长缓存；稳定索引使用 `no-cache` 或极短 TTL。发布顺序固定为：构建签名 → 上传不可变产物 → 通过 CDN 下载并验签 → 发布 GitHub Release → 上传版本化 manifest → 最后覆盖 stable manifest → 刷新 CDN → 再次公开验证。任何前置步骤失败都不得触碰 stable manifest。

## 5. Release Pipeline

新增只响应 `v<semver>` 标签的 GitHub Actions workflow，并校验标签版本与三处仓库版本完全一致。production environment approval 之前只执行无秘密的源码门禁；批准之后才注入：

- `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- 受限腾讯云 CAM SecretId/SecretKey（或后续经核实的短期身份）
- COS Bucket、Region、发布 Prefix 与 CDN 域名/刷新参数

使用 Tauri 官方 action/CLI 构建 NSIS 与签名更新产物，使用固定版本/固定提交的腾讯云官方 CLI 或已审查 action 上传和刷新 CDN。仓库脚本只负责确定性地验证版本、定位本次产物、生成标准静态 JSON、设置缓存元数据和保证“stable 最后发布”，不实现传输协议或签名算法。

GitHub Release 在 stable manifest 之前公开，使 About 页完整变更链接在客户端看到更新时已经可用。workflow 重跑必须幂等：不可变对象相同则验证后复用，不同则失败关闭；stable manifest 只允许明确的最终发布步骤覆盖。

## 6. Security and Recovery

- 客户端只内置公钥；生产私钥不写磁盘工作区、不进入 Vite 环境、缓存、artifact 或日志。
- CAM 权限限制到目标 Bucket/Prefix 的上传、必要 multipart 操作与 CDN 精确路径刷新，不授予 Bucket 管理或全局删除权限。
- COS 源桶私有；CDN 使用回源鉴权。公开更新包依靠 Tauri 签名保证真实性，不使用会过期的下载 URL。
- COS 开启版本控制与生命周期策略，保留历史不可变产物和 stable manifest 历史版本。
- 密钥 runbook 记录公钥指纹、owner、备份位置类别和恢复演练日期，不记录私钥内容。
- 坏版本只向前修复；stable manifest 回退只保护尚未升级的客户端，不声明已升级客户端会降级。

## 7. Failure Matrix

| Failure          | Observable result                    | Recovery                  |
| ---------------- | ------------------------------------ | ------------------------- |
| 自动检查网络失败 | 无 Toast，About 保留检查入口         | 下次周期或手动检查        |
| 手动检查失败     | 轻量错误提示                         | 原入口重试                |
| 下载中断         | 当前版本继续运行，进度退出，入口恢复 | 用户重新点击立即更新      |
| 签名/产物无效    | 拒绝安装并显示错误                   | 发布方修复产物/索引后重试 |
| 安装失败         | 当前版本继续可用或由安装器报告失败   | 重试或 GitHub 手动安装    |
| 发布任务前置失败 | stable manifest 不变                 | 修复 workflow 后重跑      |
| stable 误发      | 恢复上一健康索引并刷新 CDN           | 发布更高修复版本          |
| 私钥丢失/泄露    | 现有客户端不能安全迁移信任根         | 停止自动发布并走手动重装  |

## 8. Compatibility and Evidence

首期仅宣称 Windows x64 NSIS。portable、macOS、Linux 不显示或承诺自动更新。新增依赖触发 `THIRD_PARTY_NOTICES` 再生成。

证据分层：

- Vitest/RTL：store 状态机、自动/手动错误差异、24 小时调度、并发守卫、About/TitleBar 状态与 a11y。
- Rust/静态构建：插件装配、capability、config、公钥/endpoint、生产隔离、release build。
- 发布脚本测试：临时 fixture 与假上传器验证版本、manifest、缓存、stable-last 和失败退出码，不接触真实云凭据。
- Windows staging/manual-system：旧安装版通过真实 HTTPS/COS/CDN 发现签名新版本、下载、安装、重启并保留本地配置。DNS/COS/密钥未配置前不得称此层通过。
- GitHub/COS 真实发布属于外部 runtime 证据；本地 YAML/脚本检查不能冒充 production workflow 已运行。

## 9. Expected Change Boundary

- 前端：新增 update store 及测试，接入 `App`、`AboutView`、`TitleBar`、i18n 与相关 RTL。
- Tauri：updater 依赖与注册、production capability、updater config 与 release config overlay。
- 发布：新增 release workflow、确定性 manifest/publish helper 与无云副作用测试、发布 runbook。
- 治理：更新测试/发布规范，重新生成 `THIRD_PARTY_NOTICES`；不修改 LLM、文档翻译或平台能力 crate。

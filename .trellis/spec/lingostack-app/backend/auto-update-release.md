# 自动更新与稳定版发布契约

## Scenario: 维护 Windows 稳定版自动更新

### 1. Scope / Trigger

修改 updater 插件/ACL/config、`update-store`、About/标题栏更新入口、签名产物、COS/CDN 发布脚本或 `.github/workflows/release.yml` 时必须遵守本契约。涉及版本同步、GitHub Environment/Secrets、COS/CDN 生产配置和实际发布操作时，还必须阅读 [版本更新与生产部署契约](./version-release-deployment.md)。首期只支持 Windows x64 NSIS；portable、macOS、Linux 不得宣称自动更新可用。

### 2. Signatures

前端唯一状态入口：

```ts
type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "restarting"
  | "error";
type UpdateCheckSource = "automatic" | "manual";

useUpdateStore.getState().check(source: UpdateCheckSource): Promise<void>;
useUpdateStore.getState().install(): Promise<void>;
updateProgress(downloadedBytes: number, contentLength: number | null): number | null;
```

发布入口与稳定索引：

```text
git tag: v<major>.<minor>.<patch>
endpoint: https://lsupdates.yugasoft.cn/channels/stable/latest.json
release overlay: src-tauri/tauri.release.conf.template.json
release bundle config: bundle.createUpdaterArtifacts = true
node scripts/release-manifest.mjs assert-version --version <semver>
node scripts/release-manifest.mjs create ... --notes-file <path> --output <path>
python scripts/publish_immutable.py --bucket ... --region ... --key ... --file ... --cache-control ...
cargo run --release -p lingostack-app --bin verify-updater-signature -- <artifact> <signature-file>
```

GitHub `production` secrets：`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`、`TAURI_UPDATER_PUBLIC_KEY`、`COS_SECRET_ID`、`COS_SECRET_KEY`。Variables：`COS_BUCKET`、`COS_REGION`、`COS_PREFIX`、`CDN_DOMAIN`。这些值不得进入仓库、缓存、artifact 或日志；workflow 必须从 `vars.CDN_DOMAIN` 读取域名，禁止再次硬编码。

### 3. Contracts

- 只有带 `VITE_LINGOSTACK_UPDATER_ENABLED=true` 的签名 NSIS release build 启用 updater；dev、E2E 与 portable 不显示自动更新入口。
- Tauri 2 的 release overlay 必须设置 `bundle.createUpdaterArtifacts: true`，从而为 Windows NSIS 生成 `<installer>.exe.sig`；日常 `tauri.conf.json` 必须保持未启用。禁止仅设置签名环境变量后假定 `.sig` 一定存在。
- 启动后和常驻托盘每 24 小时静默检查；自动失败不提示，手动检查必须给“最新版 / 可用 / 失败”结果。发现可用更新或下载失败后仍保留 verified `Update` handle，并暂停周期检查。
- 两个“立即更新”入口共用单一 in-flight task。用户点击后下载；失败可重试；下载完成由官方 NSIS passive 安装器退出当前进程并自动启动新版本，不调用 process-plugin relaunch。
- `latest.json` 的 signature 是 `.sig` 文本内容，不是 URL；notes 来自已发布 GitHub Release body，并按纯文本展示。
- artifact、`.sig`、`manifests/<version>/latest.json` 是不可变对象：HEAD 后认证下载并比较 SHA-256；只有 404 才以 `If-None-Match: *` 条件 PUT 创建。412 并发后重新下载比较；不同字节、非 404 探测失败或无法复验均失败关闭。禁止把 ETag 当内容哈希。
- 发布顺序固定为：签名构建 → 不可变 artifact/.sig → CDN 下载 → Minisign 真验签 → GitHub Release → 不可变 version manifest → mutable stable manifest → CDN purge → 公开读取验证。stable 是唯一可变写，必须最后发生。
- 公共 CDN 验签使用 `minisign-verify 0.2.5`，按 Tauri Updater 2.10.1 的 base64 → Minisign decode → verify 顺序；不得以 HEAD、文件非空或哈希相等代替签名验证。
- 坏版本只向前修复：恢复上一健康 stable manifest 只阻断未升级客户端，随后发布更高版本；不启用自动降级。

### 4. Validation & Error Matrix

| 条件                                     | 必须结果                                          |
| ---------------------------------------- | ------------------------------------------------- |
| 自动检查网络失败                         | 静默回到可手动检查状态，不误报最新版              |
| 手动检查失败                             | 显示轻量失败和重试入口                            |
| 下载/安装失败且有 Update handle          | 保留可用更新，允许再次安装，暂停 24h 检查         |
| 重复检查/安装                            | 复用当前 Promise，不创建并发任务                  |
| NSIS 构建成功但 `<installer>.exe.sig` 缺失 | 发布失败，不上传 artifact、不创建 Release、不写 stable |
| immutable 对象存在且 SHA-256 相同        | 复用                                              |
| immutable 对象不同或状态不确定           | 非零退出，不写 stable                             |
| 条件 PUT 412                             | 下载并 SHA-256 复验；不同则失败                   |
| CDN artifact/signature 被篡改            | verifier 非零退出，不写 GitHub/stable 后续状态    |
| GitHub Release/manifest/purge 任一步失败 | workflow 失败；不得把本地静态检查称为生产发布通过 |
| 私钥丢失或泄露                           | 停止自动发布，走手动重装；不得静默替换信任根      |

### 5. Good / Base / Bad Cases

- **Good**：production 审批后注入秘密，所有不可变对象内容一致，CDN 下载验签成功，GitHub Release 可见，最后发布 stable 并公开回读正确版本。
- **Base**：本地 fixture 测试和 release build 通过，只能声明发布逻辑与构建通过；DNS/COS/CDN/真实 NSIS 更新仍待外部验收。
- **Bad**：release overlay 只注入公钥却遗漏 `createUpdaterArtifacts`；先覆盖 stable 再验证产物；同版本直接覆写 COS；用 ETag/HEAD/`.sig` 非空冒充身份验证；把私钥写入 Vite env 或临时 config artifact。

### 6. Tests Required

```powershell
pnpm lint
pnpm test
pnpm build
pnpm test:production-isolation
pnpm test:release
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo test -p lingostack-app --bin verify-updater-signature
cargo build --release -p lingostack-app
git diff --check
```

- Store 测试断言自动/手动错误差异、24h 调度、单任务、下载进度、error retry 与 retained available。
- RTL 断言 About/TitleBar 的角色、名称、进度和动态入口，不断言 Tailwind 内部类。
- Immutable publisher 至少覆盖 absent、same、different、probe error、412 same、412 different。
- Release config 测试必须同时断言渲染结果为 `bundle.createUpdaterArtifacts === true`，且日常开发配置未启用该项。
- Verifier 至少覆盖有效 Tauri wrapped Minisign、篡改 artifact、格式有效但内容篡改的 signature、畸形 material。
- 真实 Windows 验收必须从旧 NSIS 安装版完成发现、显式下载、安装、自动重启、版本与配置保留；未运行不得称 updater runtime 通过。

### 7. Wrong vs Correct

#### Wrong

```text
inject signing key only → build NSIS → assume <installer>.exe.sig exists
→ upload artifact → overwrite stable → HEAD artifact → check .sig is non-empty
```

#### Correct

```text
release overlay sets bundle.createUpdaterArtifacts=true
→ require installer + adjacent .exe.sig
→ conditional immutable publish
→ download final CDN artifact + signature
→ Minisign verify with production public key
→ publish GitHub Release + immutable version manifest
→ overwrite stable last
→ purge and publicly verify stable
```

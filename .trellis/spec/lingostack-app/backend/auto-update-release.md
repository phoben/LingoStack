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
python scripts/publish-stable-manifest.py --bucket ... --region ... --key ... --manifest ...
cargo run --release -p lingostack-app --bin verify-updater-signature -- <artifact> <signature-file>
```

GitHub `production` secrets：`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`、`TAURI_UPDATER_PUBLIC_KEY`、`COS_SECRET_ID`、`COS_SECRET_KEY`。Variables：`COS_BUCKET`、`COS_REGION`、`COS_PREFIX`、`CDN_DOMAIN`。这些值不得进入仓库、缓存、artifact 或日志；workflow 必须从 `vars.CDN_DOMAIN` 读取域名，禁止再次硬编码。

腾讯发布工具固定使用官方 PyPI 包 `cos-python-sdk-v5==1.9.44`、`tccli==3.0.1350.1` 与匹配的 `tencentcloud-sdk-python==3.0.1350`。`tccli` 的宽松依赖范围会让 pip 选择不兼容的更高 SDK，禁止只固定 CLI；安装后必须在任何发布写入前运行 `scripts/check-tccli-compatibility.py`，核对 distribution 版本并执行 CLI 自身的 `--version` 路径。`tencentcloud-cli` 不是可安装包名；安装、上传、验签、GitHub Release、manifest 与 CDN purge 所在的 PowerShell 步骤必须直接调用原生命令，并在每次调用的下一行检查 `$LASTEXITCODE`。禁止使用带 `ValueFromRemainingArguments` 的高级函数转发 native 参数：Cargo 的 `-p` 等参数会被 PowerShell 尝试绑定为函数通用参数，导致真正命令尚未运行就失败。

PowerShell 传给 Python 的动态路径、对象 key、bucket 与 region 必须作为独立 argv 值，不得插值进 `python -c` 源码。Windows 路径中的 `\a`、`\t` 等序列会被 Python 字符串再次解释，导致本地文件路径损坏。稳定索引写入必须使用 `scripts/publish-stable-manifest.py`；正式模式须先验证 manifest 是现有文件，再读取 COS 凭据和初始化客户端。dry-run 不得读取、输出凭据或访问网络。

### 3. Contracts

- 只有带 `VITE_LINGOSTACK_UPDATER_ENABLED=true` 的签名 NSIS release build 启用 updater；dev、E2E 与 portable 不显示自动更新入口。
- Tauri 2 的 release overlay 必须设置 `bundle.createUpdaterArtifacts: true`，从而为 Windows NSIS 生成 `<installer>.exe.sig`；日常 `tauri.conf.json` 必须保持未启用。禁止仅设置签名环境变量后假定 `.sig` 一定存在。
- Python/CLI 依赖安装失败必须在同一步立即终止；不得继续执行 fixture、上传或 CDN 读取。安装测试必须校验 workflow 使用官方 `tccli` 包，并逐条覆盖每个 PowerShell native-command 的直接调用与紧邻 `$LASTEXITCODE` 检查。
- 腾讯 CLI 与 SDK 版本不匹配、CLI 可执行文件缺失、`tccli --version` 非零或输出异常时，必须在任何 artifact/manifest 上传之前失败；兼容性检查不得读取 COS 凭据、访问网络、输出环境变量或完整 traceback。
- 跨 PowerShell/Python 边界的动态值必须走 argv；禁止把 Windows 文件路径拼进 Python 源码。任何本地输入无效都必须在凭据读取或云端调用之前失败关闭。
- 启动后和常驻托盘每 24 小时静默检查；自动失败不提示，手动检查必须给“最新版 / 可用 / 失败”结果。发现可用更新或下载失败后仍保留 verified `Update` handle，并暂停周期检查。
- 两个“立即更新”入口共用单一 in-flight task。用户点击后下载；失败可重试；下载完成由官方 NSIS passive 安装器退出当前进程并自动启动新版本，不调用 process-plugin relaunch。
- `latest.json` 的 signature 是 `.sig` 文本内容，不是 URL；notes 来自已发布 GitHub Release body，并按纯文本展示。
- artifact、`.sig`、`manifests/<version>/latest.json` 是不可变对象：HEAD 后认证下载并比较 SHA-256；只有 404 才以 `If-None-Match: *` 条件 PUT 创建。412 并发后重新下载比较；不同字节、非 404 探测失败或无法复验均失败关闭。禁止把 ETag 当内容哈希。
- 发布顺序固定为：签名构建 → 不可变 artifact/.sig → CDN 下载 → Minisign 真验签 → GitHub Release → 不可变 version manifest → mutable stable manifest → CDN purge → 公开读取验证。stable 是唯一可变写，必须最后发生。
- 公共 CDN 验签使用 `minisign-verify 0.2.5`，按 Tauri Updater 2.10.1 的 base64 → Minisign decode → verify 顺序；不得以 HEAD、文件非空或哈希相等代替签名验证。
- 坏版本只向前修复：恢复上一健康 stable manifest 只阻断未升级客户端，随后发布更高版本；不启用自动降级。

### 4. Validation & Error Matrix

| 条件                                       | 必须结果                                               |
| ------------------------------------------ | ------------------------------------------------------ |
| 自动检查网络失败                           | 静默回到可手动检查状态，不误报最新版                   |
| 手动检查失败                               | 显示轻量失败和重试入口                                 |
| 下载/安装失败且有 Update handle            | 保留可用更新，允许再次安装，暂停 24h 检查              |
| 重复检查/安装                              | 复用当前 Promise，不创建并发任务                       |
| NSIS 构建成功但 `<installer>.exe.sig` 缺失 | 发布失败，不上传 artifact、不创建 Release、不写 stable |
| pip 或任一 native CLI 返回非零             | 当前步骤立即失败；不得执行后续云端或 stable 操作       |
| tccli 与 Python SDK 版本不匹配             | 首次发布写入前失败；不上传 artifact 或 manifest        |
| stable manifest 路径不存在或被转义损坏     | 凭据读取和 COS 初始化前本地失败；不刷新 CDN            |
| immutable 对象存在且 SHA-256 相同          | 复用                                                   |
| immutable 对象不同或状态不确定             | 非零退出，不写 stable                                  |
| 条件 PUT 412                               | 下载并 SHA-256 复验；不同则失败                        |
| CDN artifact/signature 被篡改              | verifier 非零退出，不写 GitHub/stable 后续状态         |
| GitHub Release/manifest/purge 任一步失败   | workflow 失败；不得把本地静态检查称为生产发布通过      |
| 私钥丢失或泄露                             | 停止自动发布，走手动重装；不得静默替换信任根           |

### 5. Good / Base / Bad Cases

- **Good**：production 审批后注入秘密，所有不可变对象内容一致，CDN 下载验签成功，GitHub Release 可见，最后发布 stable 并公开回读正确版本。
- **Base**：本地 fixture 测试和 release build 通过，只能声明发布逻辑与构建通过；DNS/COS/CDN/真实 NSIS 更新仍待外部验收。
- **Bad**：release overlay 只注入公钥却遗漏 `createUpdaterArtifacts`；使用不存在的 `tencentcloud-cli` 包名；pip/上传失败后继续读 CDN；先覆盖 stable 再验证产物；同版本直接覆写 COS；用 ETag/HEAD/`.sig` 非空冒充身份验证；把私钥写入 Vite env 或临时 config artifact。

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
- Workflow 静态测试必须拒绝 `tencentcloud-cli`，锁定 `tccli==3.0.1350.1` 与 `tencentcloud-sdk-python==3.0.1350` 的兼容组合并要求安装后 checker，拒绝高级参数转发 wrapper，并证明发布步骤中的每一条 `node`、`pnpm`、`python`、`cargo`、`gh`、`tccli` 直接调用都紧邻对应的 `$LASTEXITCODE` 检查。
- Windows PowerShell 行为测试必须真实执行带 `-p` / `--release` 的子进程、返回非零的子进程及捕获 stdout 的子进程，分别证明破折号参数原样到达、失败后不会执行下一动作、GitHub Release notes 类输出仍可写入文件；非 Windows 本地环境可跳过，生产 workflow 必须在 `windows-latest` 执行。
- Workflow 静态测试必须拒绝 stable 上传使用 `python -c`，并锁定专用 helper 的 bucket、region、key、manifest argv 边界。真实 PowerShell 测试须证明旧内联模式会破坏 `D:\a\_temp\latest.json`，新 helper 保留完全相同的路径值，且缺失文件在读取凭据前失败。
- Verifier 至少覆盖有效 Tauri wrapped Minisign、篡改 artifact、格式有效但内容篡改的 signature、畸形 material。
- 真实 Windows 验收必须从旧 NSIS 安装版完成发现、显式下载、安装、自动重启、版本与配置保留；未运行不得称 updater runtime 通过。

### 7. Wrong vs Correct

#### Wrong

```text
inject signing key only → build NSIS → assume <installer>.exe.sig exists
→ forward native args through an advanced PowerShell function or omit exit checks
→ interpolate a Windows path into python -c source
→ upload artifact → overwrite stable → HEAD artifact → check .sig is non-empty
```

#### Correct

```text
release overlay sets bundle.createUpdaterArtifacts=true
→ require installer + adjacent .exe.sig
→ invoke each native command directly and immediately fail on nonzero LASTEXITCODE
→ pass every PowerShell/Python dynamic value as argv and validate local files first
→ conditional immutable publish
→ download final CDN artifact + signature
→ Minisign verify with production public key
→ publish GitHub Release + immutable version manifest
→ overwrite stable last
→ purge and publicly verify stable
```

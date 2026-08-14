# 自动化测试与桌面 E2E

## 本地运行

首次安装请使用锁文件：

```bash
pnpm install --frozen-lockfile
pnpm test:e2e
```

`test:e2e` 会通过 Tauri CLI 合并 `tauri.e2e.conf.json`，构建带 `e2e` feature 的调试二进制，启动真实主窗口，并通过 WebdriverIO embedded provider 执行桌面测试。测试应用使用独立的 bundle identifier，因此不会被开发者已打开的生产应用的单实例保护拦截。无需预先启动应用、`tauri-driver`、LLM API Key 或网络。结束时会删除本次临时配置目录；诊断结果保留在 `artifacts/e2e/`：JUnit XML、WDIO/服务日志和失败截图。

若需分别定位构建或用例问题，可运行 `pnpm test:e2e:build` 与 `pnpm test:e2e:run`。后者需要由 wrapper 提供的 `LINGOSTACK_E2E_CONFIG_PATH`，日常请使用完整命令。重复运行可直接连续执行两次 `pnpm test:e2e`；embedded server 使用固定端口 4445，若端口残留，先检查 `artifacts/e2e/wdio/` 与任务管理器中的 `lingostack-app.exe`。

## 测试与生产隔离

- Rust 的 `tauri-plugin-wdio`、`tauri-plugin-wdio-webdriver` 都是可选依赖，只由 `--features e2e` 启用；正常和 release 构建不会注册它们。
- `tauri.e2e.conf.json` 与 Rust `e2e` feature 一起启用 `e2e` capability 和 `withGlobalTauri`；生产 `tauri.conf.json` 显式只选择 `default` capability，且不暴露全局 Tauri bridge。
- WDIO guest bridge 仅在 Vite `e2e` mode 的前端构建中动态导入。普通 `pnpm build` 不打包该桥接代码。
- `pnpm test:production-isolation` 会检查默认 Cargo 依赖图、生产 capability/config，并构建普通前端产物以扫描 WDIO bridge。

## CI 与失败诊断

GitHub Actions 的 `Desktop E2E (Windows embedded)` 是独立的 Windows 阻塞门禁；无论测试成功或失败都会上传 `artifacts/e2e/`，保留 14 天。当前只将 Windows 作为真实运行门禁。WDIO 官方说明 embedded provider 支持 Windows、Linux 和 macOS，但本仓库尚未在 Linux/macOS 上获得真实 E2E 成功证据，因此它们没有被纳入该矩阵。

## 覆盖边界

自动化覆盖真实主窗口 DOM、导航、配置 IPC、`chat_stream` 的 Tauri Channel、确定性 LLM fixture 及 IndexedDB 收藏。fixture 走完整 Rust command/provider/Channel 链路，不会发 HTTP 请求或读取真实 key。

以下系统级行为不能由 WebDriver 单独证明，请在 Windows 上按此清单验收：

1. 在记事本或 VS Code 选中一段文本，按设置中的“划词唤起”快捷键；确认主窗口出现并填入选区。
2. 在 UI Automation 无法读取选区的应用中复制选区后再次触发；确认 UI 显示剪贴板降级结果，并确认不会改写剪贴板内容。
3. 在设置中更改全局热键后，关闭并重新打开应用；在外部应用中确认新快捷键可用、旧快捷键不再触发，系统冲突在设置中显示。
4. 执行一段翻译结果的“朗读”，从物理默认扬声器确认声音；再次朗读或关闭应用，确认前一句被中断。

这些步骤记录的是跨应用、原生选区、系统热键和物理音频行为；它们不是 WebDriver 自动化已通过的声明。

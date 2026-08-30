# 删除无响应与桌面右键交互复盘

## 用户症状

- 已选文档点击删除按钮没有任何可见反应。
- WebView 仍显示浏览器默认右键菜单；文件列表与连续 Markdown 阅读区缺少应用内替代。
- 原文/译文切换无法清晰表达当前互斥模式。

## 最小复现信号

生产 capability 静态断言在修复前稳定失败：`src-tauri/capabilities/default.json` 不包含确认消息权限。RTL 同时复现确认 reject 后无 alert、删除成功后 `selectedId` 变为 null，以及切换控件缺少 radio 语义。

## 根因

1. `@tauri-apps/plugin-dialog` 的 `confirm()` 需要 production capability `dialog:allow-message`；原配置只允许 open/save。
2. 两次 `confirm()` 位于 `try/catch` 之外，权限拒绝形成未处理 Promise，页面因此表现为点击无反应。
3. 删除后的 store 只清空被删的当前 ID，没有选择相邻记录。
4. WebView 原生菜单没有全局抑制，文档区域也没有应用内菜单/focus/selection contract。

本地生成的 Tauri schema 标明 `dialog:allow-confirm` 只是已废弃别名，因此没有用它修复。

## 修复与预防

- production capability 使用 `dialog:allow-message`，并由 `App.test.tsx` 读取真实 JSON 回归断言。
- 两次确认、持久化删除和页面反馈放入同一错误边界；任一步取消安全退出，reject 进入 alert。
- 删除成功后按原索引选择后一项，若无则选择前一项。
- 应用全局抑制原生 context menu；文件列表和阅读区使用同一个应用内菜单原语。
- 菜单实现 viewport 夹取、焦点导航、关闭清理；阅读区在右键打开时快照选区。
- 原文/译文使用 roving-tabindex radio group，并支持方向键与 Home/End。

## 自动化证据

- Frontend：26 files / 172 tests。
- Rust workspace：158 tests；feature-gated app：24 tests。
- Windows Tauri E2E：1 spec / 11 tests。
- lint、TypeScript/Vite build、production isolation、release build、notices、fmt/clippy 与 scoped diff check 通过。

## 证据边界

未人工验收 864×576 的像素级布局、真实系统确认/保存对话框外观及真实鼠标右键手感；macOS/Linux 未在目标平台运行。

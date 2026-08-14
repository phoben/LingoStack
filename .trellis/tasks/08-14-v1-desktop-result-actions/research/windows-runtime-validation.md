# Windows 真实运行验证（2026-08-14）

## 隔离与恢复

- 以独立 `WEBVIEW2_USER_DATA_FOLDER` 启动 `pnpm tauri dev --no-watch`，测试期间把真实 `%APPDATA%\lingostack\config.json` 移出活动路径。
- 验证结束后停止准确的 LingoStack 测试进程，真实配置以 SHA-256 `F120E0A394403AD6F1DC9F147D3FDA30EC6781723F30A7374EB7E84DBAE4E69F` 原样恢复。
- 隔离运行目录已移入 Windows 回收站；测试新建的 Notepad 标签已选择“不保存”关闭，原有标签保持不变。
- 剪贴板降级测试由 STA 辅助进程在内存中保存原 `IDataObject`，45 秒后在 `finally` 中恢复；未把原剪贴板内容写盘。

## UIA 与剪贴板

| 场景 | 实际结果 | 证据边界 |
|------|----------|----------|
| WPF 原生 TextBox 全选 `LingoStack UIA selection proof`，按 `Ctrl+Shift+D` | 主窗口翻译页收到完全一致原文，未显示剪贴板提示 | 真实 Windows UIA + Tauri event + React 注入 |
| WPF TextBox 无选区，剪贴板临时设为 `LingoStack clipboard fallback proof` | 原文完全一致，出现“已使用剪贴板中的文本”提示 | 真实 Windows clipboard 降级；原剪贴板随后恢复 |
| 未配置翻译模型 | 注入后显示可恢复配置错误，不影响取词来源判断 | 未调用付费 LLM |

运行验证先发现并修复一个真实缺陷：热键原先先聚焦 LingoStack、再由前端取词，导致 UIA 永远读取错误窗口。修复后由 Rust 热键回调在聚焦前捕获 selection，并把 payload 随事件发送。

## TTS

- 对 UIA 注入原文点击“朗读原文”，按钮可观察地切换为“停止朗读”；点击后恢复“朗读原文”，未出现 IPC 错误。
- 这证明 SAPI 命令已受理以及 stop 往返和前端状态成立；自动化无法听见扬声器，**实际可听声音仍需人工确认**，未把按钮状态表述为听感证据。

## 窗口、托盘与单实例

| 场景 | 实际结果 |
|------|----------|
| 标题栏关闭按钮 | 首轮发现缺少 `core:window:allow-hide` 导致无效果；补权限后主窗口隐藏，进程继续存活 |
| 原生 Alt+F4 | 主窗口隐藏，进程继续存活 |
| 默认 Alt+Space | 隐藏后重新显示同一主窗口 |
| 第二次启动 debug exe | 第二进程 5 秒内退出；常驻进程数始终为 1 |

托盘五项菜单的构建、id 映射与前端导航事件已由 Rust/RTL 自动化覆盖。当前 computer-use Windows provider 声明 `surfaces.menus=false`，未自动点击系统托盘原生菜单，因此五项菜单的逐项原生点击仍应由人工做一次视觉确认。

## 待人工确认

1. 扬声器实际可听到 SAPI 输出，且停止后声音立即结束。
2. 系统托盘右键菜单肉眼可见五项，并逐项点击确认主窗口、划词翻译、收藏、设置、退出。

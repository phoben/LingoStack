# 应用装配

`src/lib.rs` 的 `run()`（`:20-58`）。`main.rs` 只有 6 行，只调它。

## 启动顺序

顺序有依赖，改动前先确认：

1. `tauri::Builder::default()`（`:21`）
2. **单实例插件**（`:24-32`，`#[cfg(desktop)]` 门控）——回调里显示并聚焦已有的 `"main"` 窗口
3. `.manage(AppState { config_path })`（`:35-37`）
4. **全局热键插件**（`:38`）——必须在 `setup()` 注册热键之前
5. `.invoke_handler(generate_handler![...])` 注册 7 个命令（`:39-47`）
6. `.setup(...)`（`:48-55`）：先建托盘 `lingostack_hook::setup_tray(handle)?`，再 `config::load()`，再 `hotkeys::register_and_report(handle, &cfg.hotkeys)`
7. `.run(generate_context!())` 带 `.expect(...)`（`:56-57`）

第 7 步的 `.expect` 是全 crate 唯一可接受 panic 的地方——启动失败属致命错误。**其他地方不要用 `unwrap` / `expect`。**

新增插件加在第 4 步附近；新增需要 `AppHandle` 的初始化加在 `setup()` 里，注意它在托盘之后。

## 热键注册与冲突上报

`src/hotkeys.rs`。分工：冲突检测规则在 `lingostack-core`，加速器字符串渲染在 `lingostack-hook/src/accelerator.rs`，**实际注册与上报在这里**。

上报结构（`:16-25`）：

```rust
struct HotkeyStatus {
    action: HotkeyAction,
    accelerator: String,
    registered: bool,
    error: Option<String>,   // #[serde(skip_serializing_if = "Option::is_none")]
}
```

行为约定（`:60-98`、`:101-109`）：

- 注册失败**不中断启动**，逐条记录
- 任何失败都当作疑似冲突，消息为「注册失败（疑似与系统或其他应用冲突）」
- **无论成败都发送完整状态列表**到 `"hotkey-status"` 事件，前端据此标红单条

这个「不阻断 + 全量上报」的形状要保持。新增热键动作时，前端需要能拿到它的注册结果。

`register_all` / `register_and_report` / `apply_effect` **均无测试**（需要活的 `AppHandle`）。测试只覆盖纯函数 `effect_for` 与序列化形状（`:134-180`）。

## ACL

`capabilities/default.json`，作用域 `"windows": ["main"]`。声明 `core:default` + 四个窗口控制权限 + `core:event:default`——只为自定义标题栏的窗口按钮和跨窗口事件监听服务。

自定义 `#[tauri::command]` 不需要 ACL 条目（`:4` 说明）。

## 窗口配置

`tauri.conf.json` 目前**只有主窗口**。划词翻译走主窗口（唤起 → 切翻译视图 → 取词 → 自动翻译），**不采用独立浮窗或划词工具栏**——这是设计文档 §4.3 的决策。

不要为划词场景新建窗口。CLAUDE.md 仓库布局里提到的「翻译浮窗 / 划词工具栏 / 文档阅读器」是留待后续的占位描述，与当前决策不冲突但也未实装。

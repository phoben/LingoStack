# 应用装配

`src/lib.rs` 的 `run()`（`:20-58`）。`main.rs` 只有 6 行，只调它。

## 启动顺序

顺序有依赖，改动前先确认：

1. `tauri::Builder::default()`（`:21`）
2. **单实例插件**（`:24-32`，`#[cfg(desktop)]` 门控）——回调里显示并聚焦已有的 `"main"` 窗口
3. `feature=e2e` 时条件注册两个 WDIO 插件；默认/发行构建无此步骤
4. 只解析一次 `config_path`，clone 给 `AppState`，原值 move 进 setup，保证两处读取同一文件
5. `.manage(AppState { config_path })`
6. **全局热键插件**——必须在 `setup()` 注册热键之前
7. `.invoke_handler(generate_handler![...])` 注册 10 个命令
8. `.setup(...)`：先建托盘，再用同一个 `config_path` 加载配置，最后注册热键
9. `.run(generate_context!())` 带 `.expect(...)`

第 9 步的 `.expect` 是全 crate 唯一可接受 panic 的地方——启动失败属致命错误。**其他地方不要用 `unwrap` / `expect`。**

新增插件加在第 4 步附近；新增需要 `AppHandle` 的初始化加在 `setup()` 里，注意它在托盘之后。

WDIO 插件、E2E config/capability 与 build-script codegen 的完整隔离规则见 [真实桌面 E2E 契约](./e2e-testing.md)。不要为测试方便在生产 `tauri.conf.json` 启用 `withGlobalTauri`。

## 首帧显示契约

主窗口在 `tauri.conf.json` 中固定为 `"visible": false`；`run()` 通过
`Builder::on_page_load` 等待标签为 `main` 的 WebView 发出
`PageLoadEvent::Finished`，再调用 `webview.window().show()`。这样窗口只在主题预加载、
样式表和同步 React 挂载均完成后出现，不暴露 WebView2 的默认白色背景。

- `Started` 事件不得显示窗口；否则深色主题启动时仍会闪白。
- 其他窗口的加载事件不得显示主窗口；后续新增窗口时继续按 label 隔离生命周期。
- 显示守卫在进程生命周期内只消费一次；后续页面刷新不得把已隐藏到托盘的窗口
  意外重新弹出。
- 托盘和单实例回调仍可在应用已启动后显示并聚焦同一个 `main` 窗口，不新增前端
  `show()` 调用或 `core:window:allow-show` 权限。
- `src-tauri/src/lib.rs` 的单元测试必须同时锁定初始隐藏配置和
  `main + Finished` 判定；真实首帧观感属于 Windows 桌面运行验收，不能由单元测试替代。

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

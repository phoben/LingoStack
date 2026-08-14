# lingostack-hook 开发规范

> 全局热键的加速器渲染 + 系统托盘。依赖 `tauri`（本 crate 不受 core 的纯净性约束）。

路径：`crates/lingostack-hook`（18 + 110 + 151 行）

## 开发前检查清单

- [ ] 读了 [Rust 通用约定](../../guides/rust-conventions.md)
- [ ] 热键的**冲突检测规则**改动 → 那在 `lingostack-core/src/hotkey.rs`，不在这里
- [ ] 热键的**实际注册与上报**改动 → 那在 `src-tauri/src/hotkeys.rs`，不在这里
- [ ] 新增纯函数就写测试；碰到需要 `AppHandle` 的代码要知道那部分测不了

## 结构

| 文件 | 内容 |
|------|------|
| `src/lib.rs` | 模块声明 + 再导出 |
| `src/accelerator.rs` | `KeyCombo` → 加速器字符串；有效性校验 |
| `src/tray.rs` | 托盘菜单与图标构建、点击/菜单事件分派 |

## 三段式分工

热键这条链路跨三个 crate，改动前先定位：

| 关注点 | 位置 |
|--------|------|
| 冲突检测规则（纯逻辑） | `lingostack-core/src/hotkey.rs` 的 `detect_conflicts()` |
| 加速器字符串渲染 | **本 crate** `accelerator.rs` |
| 注册、失败上报、窗口动作执行 | `src-tauri/src/hotkeys.rs` |

## 加速器渲染

`to_accelerator(&KeyCombo) -> String`（`accelerator.rs:21`）：修饰键**固定顺序 Ctrl → Alt → Shift → Super**（`:23-34`），主键大写（`:35`）。顺序是 `tauri-plugin-global-shortcut` 能解析的前提，不要改。

`is_valid(&KeyCombo) -> bool`（`accelerator.rs:44`）：要求非空主键**且至少一个修饰键**（`:45`）——没有修饰键的裸键会劫持正常输入（理由见 `:40-42`）。

加速器单测覆盖渲染顺序、大写、两个默认热键和有效性规则。改渲染逻辑必须同步这批测试，禁止恢复已移除的独立翻译浮窗动作。

## 托盘

`tray.rs` 构建 3 项菜单（主窗口 / 设置 / 退出，`:46-53`）与 `TrayIconBuilder`（`:55-62`）。

事件分派：`handle_tray_event`（左键点击切换显示，双击总是显示）、`handle_menu_event`（按菜单 id 字符串分派）。

`toggle_action(visible, minimized) -> WindowAction`（`:29`）被**刻意抽成纯函数以便单测**——最小化状态算作「不可见」。这个手法值得在新增托盘行为时照用：把判定逻辑抽成纯函数，副作用留在外层。

## 平台隔离：本 crate 是例外

模块文档（`lib.rs:3-4`）声称按 `#[cfg(target_os)]` 分文件隔离（同 `lingostack-selection`），**但本 crate 并没有** `windows.rs` / `macos.rs` / `linux.rs`。`accelerator.rs` 与 `tray.rs` 都是平台无关逻辑，平台差异交给 Tauri 抽象（`tray.rs:6` 说明按需再拆）。

别照着那句注释找不存在的文件。真需要平台特化时，照 [平台隔离指南](../../guides/platform-isolation-guide.md) 的模式新建分文件。

## 依赖 tauri 是合规的

CI 的纯净性检查只针对 `lingostack-core`（`.github/workflows/ci.yml:58-65`）。本 crate 正常依赖 `tauri`（`Cargo.toml:11`），符合设计。不要把 core 的约束外推到这里。

## 测试现状

- `accelerator.rs` — 覆盖渲染顺序、两个默认绑定与裸键非法规则
- `tray.rs:127-151` — 4 个测试，**只测纯函数 `toggle_action`**。`setup_tray` / `handle_tray_event` / `handle_menu_event` / `apply_window_action` 零覆盖（需要活的 `AppHandle`）
- `lib.rs:12-18` — `assert_eq!(1+1, 2)` 占位烟雾测试，没测任何东西，可以在下次动这个文件时替换成真实断言

## 质量检查

```bash
cargo clippy --all-targets -- -D warnings
cargo test -p lingostack-hook
```

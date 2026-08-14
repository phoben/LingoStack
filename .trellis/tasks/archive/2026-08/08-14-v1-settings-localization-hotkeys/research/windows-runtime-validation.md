# Windows 真实运行验证

日期：2026-08-14
环境：Windows 11、`pnpm tauri dev --no-watch`、Orca computer-use Windows provider

## 隔离与恢复

- 启动前把 `%APPDATA%\lingostack\config.json` 复制到独立临时目录并移出活动路径，测试从默认配置开始。
- 测试结束后先启动一次原配置同步 WebView 主题缓存，再以初始备份覆盖回活动路径。
- 最终对活动配置与初始备份计算 SHA-256，结果完全一致；未读取或记录提供商密钥。
- 测试过程中创建的全局热键占用进程均已终止。

## 可观察结果

1. 默认启动：界面为中文/跟随系统，`Alt+Space` 与 `Ctrl+Shift+D` 均显示“已注册”。磁盘配置仅含 `translate_selection` 与 `show_main_window` 两个动作。
2. 实时切换：界面语言改为 English 后，标题栏、导航、翻译页和设置页立即切换英文；主题切为 Dark 后标题栏立即显示 `Theme: Dark`。
3. 前端冲突与恢复：把翻译热键改为与主窗口相同的 `Alt+Space` 时，页面显示 “Each shortcut needs modifiers, a key, and must be unique.”，原配置未被重复绑定污染；改为 `Ctrl+Alt+Shift+M` 后两项均显示 `Registered`。
4. 重启持久化：关闭并重新启动应用，首个完整可访问性快照即显示英文界面和 `Theme: Dark`；设置页显示 `Ctrl+Alt+Shift+M` 且为 `Registered`。
5. 系统级冲突：关闭应用后，由独立 Win32 `RegisterHotKey` 进程占用 `Ctrl+Alt+Shift+M`，再启动应用。后端日志出现 `[hotkey] 1 个热键注册失败，已上报前端`；设置页只把翻译热键标为“注册失败（疑似与系统或其他应用冲突）”，`Alt+Space` 仍为 `Registered`。
6. 冲突恢复：终止占用进程并点击 `Save and re-register`，无需重启，两项立即恢复为 `Registered`。

## 自动化门禁

实施与检查代理在真实运行前已通过：

```powershell
cargo test --workspace
cargo build --workspace
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
pnpm test
pnpm lint
pnpm build
git diff --check
```

前端共 17 个测试文件、137 个测试通过。真实运行没有调用外部 LLM，也没有修改或依赖独立 `tauri-e2e-ci` 工作树。

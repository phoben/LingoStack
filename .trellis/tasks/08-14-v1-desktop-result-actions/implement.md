# 实施计划：桌面集成与结果操作

- [ ] 1. 扩展 App/translation 注入状态，保留 selection source/error 并实现降级/失败反馈。
- [ ] 2. 补齐托盘菜单与主窗口视图路由事件，覆盖显示、聚焦、收藏、设置、退出。
- [ ] 3. 实现前端 TTS 状态与朗读/停止切换、错误/Unsupported 反馈和测试。
- [ ] 4. 补 Favorites DB/store/view 测试，修复发现的事务/导入/回滚缺陷但不扩 schema。
- [ ] 5. 验证单实例与窗口生命周期，补能下沉为纯函数的测试。
- [ ] 6. 在 Windows 执行 UIA、剪贴板降级、SAPI 出声/停止、托盘/单实例手工清单。
- [ ] 7. 运行全量门禁并保存运行证据。

## Validation

```powershell
cargo test -p lingostack-selection
cargo test -p lingostack-hook
cargo test -p lingostack-tts
cargo test -p lingostack-app
pnpm test
pnpm lint
pnpm build
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
pnpm tauri dev
```

## Rollback

不得改变 selection 的 UIA→剪贴板两级降级或 TTS 常驻单线程模型。发现原生回归时回退调用层切片，保留已有 Windows 实现与测试。

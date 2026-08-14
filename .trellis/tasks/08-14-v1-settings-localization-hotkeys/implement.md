# 实施计划：设置、本地化与热键

- [ ] 1. 更新 Rust 配置/热键模型与旧 JSON 迁移，补 serde/default/迁移测试并同步 TS 镜像。
- [ ] 2. 建立类型化中英字典与 locale 解析，把导航、现有 V1 视图和设置文案接入。
- [ ] 3. 实现语言映射、默认目标、界面语言和 Prompt 编辑/恢复界面。
- [ ] 4. 统一主题配置真源，保持 index.html/localStorage 防闪烁缓存同步。
- [ ] 5. 实现热键捕获、校验、保存、重新注册 IPC 与真实状态监听/主动获取。
- [ ] 6. 移除静态 macOS 键帽和伪冲突示例，补设置/store/RTL/IPC 测试。
- [ ] 7. 在 Windows 实跑重启持久化和制造冲突→修改→恢复链路，运行全量门禁。

## Validation

```powershell
cargo test -p lingostack-core
cargo test -p lingostack-hook
cargo test -p lingostack-app
pnpm test
pnpm lint
pnpm build
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
pnpm tauri dev
```

## Rollback

先验证旧配置 fixture 可读再切换 UI；若迁移失败，回滚模型与 UI 整个切片，不覆盖用户原配置。热键重注册必须保留至少“设置页仍可通过主窗口打开”的恢复路径。

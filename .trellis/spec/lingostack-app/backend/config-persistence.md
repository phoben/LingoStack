# 配置落盘

`src/config.rs`。配置的**内存模型与序列化**在 `lingostack-core`，**磁盘 IO 只在这里**——不要把文件读写搬回 core，会破坏它的纯净性约束。

## 路径解析

```
dirs::config_dir()  /  "lingostack"  /  "config.json"
```

（`:22-28`）`dirs::config_dir()` 返回 `None` 时**降级到当前目录**（`PathBuf::from(".")`），不报错。

## 读

`load()`（`:31-37`）：

- 文件不存在 → `Ok(AppConfig::default())`，视为首次运行，**不是错误**（`:34`）
- 其他 IO 错误 → 向上传播
- JSON 解析失败 → `ConfigError::Json`

首次运行返回默认值这条依赖 `lingostack-core` 的 `impl Default for AppConfig`——加配置字段时记得同步那份清单（见 [配置模型](../../lingostack-core/backend/config-model.md)）。

## 写

`save()`（`:40-48`）：`create_dir_all(parent)` → `to_string_pretty` → `fs::write` → `restrict_permissions`。

用 `to_string_pretty` 是刻意的——用户可能手工编辑配置文件。

## 权限收紧：Windows 上是空操作

`restrict_permissions`（`:51-64`）：

- `#[cfg(unix)]` 分支：`PermissionsExt::set_mode(0o600)`（`:52-58`）
- `#[cfg(not(unix))]` 分支：**空操作**，`let _ = path;`（`:59-62`）

`:4` 注释写明现状：Windows 暂用文件默认 ACL，后续按用户 SID 收紧。

**这是一个真实安全缺口**：配置文件里存着 API Key，而主开发与主目标平台是 Windows。做安全相关工作时不要把「配置文件权限已收紧」当成既成事实。要补 Windows ACL，需要用 `windows` crate 操作 DACL，并且这段代码目前**没有任何测试**。

## 测试

`:66-118` 的现有测试使用 `tempfile::tempdir()`，覆盖读写往返、文件缺失和损坏 JSON。

**`restrict_permissions` 完全未测**——Unix 的 0600 路径也没测。改这个函数时要自己建测试，别指望现有测试拦住回归。

## 启动时配置被读了两次

`src/lib.rs:36-37` 建 `AppState { config_path }` 时只存路径；`:52` 在 `setup()` 里又独立 `config::load()` 一次拿热键绑定。

两次需求不同（一次要路径、一次要内容），不算 bug。但如果要加「启动时读一次并缓存进 state」，得同时改这两处，并注意 `load_config` 命令目前是每次调用都重新读盘。

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
- 反序列化成功后调用 `normalize_hotkeys()`：旧动作别名先由 serde 接收，再按动作去重并转成当前 V1 绑定集合

首次运行返回默认值这条依赖 `lingostack-core` 的 `impl Default for AppConfig`——加配置字段时记得同步那份清单（见 [配置模型](../../lingostack-core/backend/config-model.md)）。

## 写

`save()`（`:43-54`）：克隆并 `normalize_hotkeys()` → `create_dir_all(parent)` → `to_string_pretty` → `fs::write` → `restrict_permissions`。调用方对象不被原地修改，磁盘上永远写规范化后的动作名与每动作一条绑定。

用 `to_string_pretty` 是刻意的——用户可能手工编辑配置文件。

## 权限收紧：Windows 上是空操作

`restrict_permissions`（`:51-64`）：

- `#[cfg(unix)]` 分支：`PermissionsExt::set_mode(0o600)`（`:52-58`）
- `#[cfg(not(unix))]` 分支：**空操作**，`let _ = path;`（`:59-62`）

`:4` 注释写明现状：Windows 暂用文件默认 ACL，后续按用户 SID 收紧。

**这是一个真实安全缺口**：配置文件里存着 API Key，而主开发与主目标平台是 Windows。做安全相关工作时不要把「配置文件权限已收紧」当成既成事实。要补 Windows ACL，需要用 `windows` crate 操作 DACL，并且这段代码目前**没有任何测试**。

## 测试

配置 IO 测试用 `tempfile::tempdir()` 覆盖读写往返、文件缺失、损坏 JSON；旧热键动作名的迁移规则由 `lingostack-core` 测试覆盖（见 `hotkey.rs` 的 `legacy_popup_deserializes_as_selection_and_reserializes_new_name`）。

**`normalize_hotkeys`（去重合并）本身没有任何测试**——不要假设它已被覆盖，改这个函数前先补测试。

**`restrict_permissions` 完全未测**——Unix 的 0600 路径也没测。改这个函数时要自己建测试，别指望现有测试拦住回归。

## 启动时配置被读了两次

`src/lib.rs:36-37` 建 `AppState { config_path }` 时只存路径；`:52` 在 `setup()` 里又独立 `config::load()` 一次拿热键绑定。

两次需求不同（一次要路径、一次要内容），不算 bug。但如果要加「启动时读一次并缓存进 state」，得同时改这两处，并注意 `load_config` 命令目前是每次调用都重新读盘。

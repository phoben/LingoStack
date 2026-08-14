# 技术设计：设置、本地化与热键

## Configuration

引入明确的界面语言模式并为旧 `ui_language` 值提供迁移。Rust 配置文件是真源；config store 加载后驱动 i18n、主题和设置控件。主题 localStorage key 保留，但只能作为 Rust 配置的同步缓存。

语言映射编辑使用原生 select 与行表；拒绝 source=target 和重复 source，错误就近展示。Prompt 编辑复用手写 textarea，固定协议提示与用户内容分离。

## i18n

使用类型化的 `zh`/`en` 字典与轻量 `t(key)` API，不增加大型依赖。字典 key 在编译期保持同构；动态错误保留后端原文并加本地化前缀。系统模式从 `navigator.language` 解析，非中文一律回退英文。

## Hotkeys

Rust 热键动作收敛为 `TranslateSelection`、`ShowMainWindow`。旧 `translate_popup` 使用 serde alias/加载归一化迁移；重复动作最后一条生效并在保存时规范化。

新增 `register_hotkeys` 命令：注销本应用既有绑定，按传入配置逐条注册，返回全量 `HotkeyStatus` 并广播同样事件。前端启动后主动查询/注册一次，避免 setup 早于监听器导致状态丢失。捕获控件只接受至少一个修饰键 + 主键，显示平台中立的加速器文本。

## Failure handling

配置 store 延续“保存失败不回滚但显示错误”的项目约定；热键运行态只在注册成功后更新成功标记。若部分注册失败，其余项保持可用。

## Tests

Rust 覆盖旧配置迁移、默认值、冲突与规范化；TS 覆盖字典完整性、system 解析、theme cache 同步；RTL 覆盖语言映射、Prompt、热键捕获/冲突恢复与 async live region。

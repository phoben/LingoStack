# 技术设计：桌面集成与结果操作

## Event routing

全局系统事件统一携带主窗口目标视图/动作，而不是创建新窗口。热键 `translate-selection` 必须先在原应用仍处于前台时取词，再显示/聚焦主窗口，并发送 `{ selection?, error? }`；App 将有效 `{text, source}` 注入 translate store。托盘“划词翻译”保留空载荷，App 才调用 `get_selection` 走既有降级；托盘收藏/设置事件只切换 `activeView`。

取词反馈进入 app/translation 状态：`accessibility` 无额外提示，`clipboard` 显示可关闭的 polite notice，错误显示 alert 和手动粘贴提示。不得吞掉最终错误。

## TTS

前端新增 TTS store/hook 管理 `idle | submitting | speaking | error` 与当前文本。`speak` 成功只代表引擎受理，UI 允许用户随时 `stop_speaking`；不虚构播放完成。新的朗读会替换当前朗读，保持 Windows 常驻 voice 线程和 purge 语义。

## Favorites

不改 IndexedDB schema。结果收藏仍写原文/译文/来源；tag 是展示元数据，不单独存储。为原生 IndexedDB 封装与 store 增加 fake IndexedDB 测试，验证事务失败回滚和导入原子性。

## Native verification

自动化覆盖事件、视图、IPC 调用和状态；真实 UIA 选区与 SAPI 出声/停止使用 Windows 手工清单记录。macOS/Linux 继续由类型化占位测试守护。

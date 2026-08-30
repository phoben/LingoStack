# 文档导入 `undefined.id` 回归记录

- 现象：可解析文档上传成功后，前端抛出 `TypeError: Cannot read properties of undefined (reading 'id')`。
- 根因：Rust 的内部标签 newtype 成功变体把 `DocumentSnapshot` 字段展平，前端契约却读取 `{ type, data }`，因此 `outcome.data` 为 `undefined`。
- 修复：成功变体改为显式 `data` 结构字段；拒绝结果继续使用 `{ type, message }`。
- 红测：`cargo test -p lingostack-document import_outcome_serializes_success_snapshot_under_data` 在修复前以 `Null != "doc-1"` 失败。
- 回归点：首次导入立即翻译并选中；重复导入只打开已有记录；OCR/业务拒绝不发起翻译。
- 连续 Markdown 重构后的真实 Windows Tauri E2E 再次穿过生产 `import_document`，断言 `{type,data.id}` 后完成翻译、默认译文阅读和原文切换，防止该崩溃随 reader interface 调整复发。

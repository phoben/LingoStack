# 实施计划：智能翻译契约与可靠性

- [x] 1. 在 core 定义词条协议常量、Prompt 组合与结构/语言 plan；补纯逻辑和快照不变量测试。
- [x] 2. 增加/调整 Tauri IPC，使翻译入口消费 core 语言规则，并同步 TypeScript 镜像与契约测试。
- [x] 3. 实现纯 TypeScript 增量信封解析器及完整分片/损坏/0–6 项测试。
- [x] 4. 调整 stream store 为翻译结构化状态，保证协议文本不进入正文、失败保留译文。
- [x] 5. 在翻译结果下方实现轻量 tag 与键盘可达解释浮层；补 RTL 测试。
- [x] 6. 在 Tauri 驱动层实现零输出单次重试、429 冷却与测试，保持 provider 内部不抽象合并。
- [x] 7. 收紧命名 parser/UI 为 5 个候选边界并补少/多/畸形用例。
- [x] 8. 同步设计文档中的融合解释契约，运行全量门禁与真实 Tauri IPC 往返。

## Validation

```powershell
cargo test -p lingostack-core
cargo test -p lingostack-llm
cargo test -p lingostack-app
pnpm test
pnpm lint
pnpm build
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
pnpm tauri dev
```

## Rollback

信封、解析器、Prompt 后缀和 UI 必须作为一个原子切片提交；若跨 provider 兼容性失败，整体回退为纯文本流，不留下会泄漏 sentinel 的半实现。

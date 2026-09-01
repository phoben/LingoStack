# 实施计划：朗读自然结束后状态复位

## 0. 开始条件

- [ ] 用户批准本任务最新 PRD、design、implement 摘要。
- [ ] 批准后的后续消息才运行 `task.py start`；规划回合不改产品代码。
- [ ] 开始前复核 `git status`，保留并适配现有未提交改动。

## 1. 建立红灯反馈

- [ ] 在 `tts-store.test.ts` 建立可控 Channel mock：收到 `started` 后为 speaking，收到 `done` 后必须回 idle。旧实现应因没有完成事件而失败。
- [ ] 增加旧朗读迟到 done、主动 stop、A 被 B 替换与错误场景，保证测试确定、秒级、可无人值守运行。
- [ ] 在页面组件测试中至少断言一个真实按钮由停止标签恢复为朗读标签，证明 store 到 UI 的用户可观察链路。

快速反馈：

```powershell
pnpm vitest run src/stores/tts-store.test.ts src/components/views/translate-view.test.tsx src/components/views/favorites-view.test.tsx
```

## 2. 实现 Rust 完成信号

- [ ] 为 `Speaker` 增加 utterance 完成句柄与 `Finished` / `Interrupted` 结果，保持对象安全和 `Send + Sync`。
- [ ] Windows 朗读线程维护 active utterance，使用 SAPI 真实运行状态检测自然结束；新 Speak / Stop 把旧 utterance 标记为 Interrupted。
- [ ] 保持 `SPF_ASYNC`、单一常驻 voice、打断语义和 stop 响应；不把 `ISpVoice` 移出 COM 线程。
- [ ] 更新 Stub 与 macOS/Linux 占位测试，新增完成/中断结构测试并保留原有非阻塞、线程复用和无死锁测试。

快速反馈：

```powershell
cargo test -p lingostack-tts
```

## 3. 打通 IPC 与前端状态

- [ ] 定义 `TtsEvent`，让 `speak` 通过请求级 Channel 发送 started/done/error，并在后台等待完成句柄；监听线程启动失败直接返回错误。
- [ ] 同步 `src-tauri/src/lib.rs` 注册、E2E fixture、`src/lib/ipc.ts` 类型封装与参数名。
- [ ] 更新 `tts-store` 事件处理与 generation 守卫，不修改各页面的视觉结构。
- [ ] 扩展 feature-gated app 测试与 WDIO 场景，验证真实 command/Channel 后图标自动复位。

## 4. 回归与质量门禁

```powershell
pnpm lint
pnpm test
pnpm build
cargo test -p lingostack-app --features e2e
pnpm test:production-isolation
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
git diff --check
```

- [ ] 如本机桌面 E2E 环境可用，运行 `pnpm test:e2e` 并记录退出码与场景；不可用时明确报告缺失证据。
- [ ] Windows 实窗分别从翻译页和收藏页朗读短文本，观察真实播放结束后自动恢复喇叭；该项单独记为 manual-system。
- [ ] 搜索并移除所有临时 debug instrumentation 与一次性探针。

## 5. 收尾

- [ ] 更新 TTS、前端状态、IPC 与测试规范中的旧“保持 speaking 直到主动停止”契约。
- [ ] Trellis check 逐条核对 AC1–AC7。
- [ ] 展示精确文件集与证据；未经另行授权不 commit、不 push、不 archive。

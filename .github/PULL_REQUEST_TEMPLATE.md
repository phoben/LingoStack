## 变更说明

<!-- 这个 PR 做了什么？为什么需要？ -->

关联 Issue：<!-- Closes #123 / 无 -->

## 自测清单

- [ ] `cargo fmt --all --check` 通过
- [ ] `cargo clippy --all-targets -- -D warnings` 零警告
- [ ] `cargo test --workspace` 全绿
- [ ] `pnpm lint` 零警告（若改动前端）
- [ ] `pnpm test` 全绿（若改动前端）
- [ ] `pnpm build` 通过（若改动前端）
- [ ] 新功能 / 修复带了测试
- [ ] 每个 commit 都有 `Signed-off-by`（`git commit -s`，DCO 必需）

## 运行时验证

<!--
涉及系统能力（取词 / 热键 / 朗读 / 窗口）或 LLM 调用的改动，
请说明你实际跑过什么、在哪个平台。单测覆盖不到的部分尤其重要。
-->

测试平台：<!-- Windows 11 / macOS 15 / Ubuntu 24.04 -->

## 界面改动

<!-- 若改动 UI，请附截图或 GIF，并说明是否对照了 /lingostack-design 的原型稿 -->

## 检查项

- [ ] 未在代码、日志、截图中泄漏 API Key
- [ ] 平台相关代码按 `#[cfg(target_os)]` 分文件隔离，未在调用侧写平台分支
- [ ] 若改动与设计文档冲突，已同步修订 `docs/lingostack-design.md`

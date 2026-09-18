# 测试选择指南

> 这里只帮助判断“这次改动要验证到哪一层”。具体命令、断言、错误矩阵和证据措辞统一见 [全仓自动化测试与质量门禁契约](../lingostack-app/backend/testing-strategy.md)。

## 改动前

- [ ] 是纯函数、store/组件、Rust package、跨 IPC、Tauri 装配，还是平台原生能力？
- [ ] 哪个 package spec 规定了该行为的正常、边界与错误断言？
- [ ] 是否触发真实桌面 E2E、生产隔离或 release build？
- [ ] 是否需要目标平台或人工系统证据，而不是单元/WebDriver 证据？
- [ ] 是否刚做过 merge/rebase/cherry-pick、冲突解决或同步目标分支？若是，先运行 `pnpm check:integrity`，此前测试结果作废。
- [ ] 目标分支最近一次必需 CI 是否成功？红色、取消或未知基线必须先修复。

## 汇报前

- [ ] 区分 planned、static、local-runtime、ci-runtime、manual-system。
- [ ] 记录实际 OS、命令、退出码、场景与诊断工件。
- [ ] 未运行的平台与系统行为明确写“未执行/需目标平台验收”。
- [ ] 没有用静态检查冒充 runtime，也没有用 E2E 冒充物理音频/外部应用能力。
- [ ] PR 的 `Quality Gate` 与所有必需检查均已到达成功终态；没有把运行中、跳过或部分绿色写成可合并。

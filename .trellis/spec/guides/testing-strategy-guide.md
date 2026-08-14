# 测试选择指南

> 这里只帮助判断“这次改动要验证到哪一层”。具体命令、断言、错误矩阵和证据措辞统一见 [全仓自动化测试与质量门禁契约](../lingostack-app/backend/testing-strategy.md)。

## 改动前

- [ ] 是纯函数、store/组件、Rust package、跨 IPC、Tauri 装配，还是平台原生能力？
- [ ] 哪个 package spec 规定了该行为的正常、边界与错误断言？
- [ ] 是否触发真实桌面 E2E、生产隔离或 release build？
- [ ] 是否需要目标平台或人工系统证据，而不是单元/WebDriver 证据？

## 汇报前

- [ ] 区分 planned、static、local-runtime、ci-runtime、manual-system。
- [ ] 记录实际 OS、命令、退出码、场景与诊断工件。
- [ ] 未运行的平台与系统行为明确写“未执行/需目标平台验收”。
- [ ] 没有用静态检查冒充 runtime，也没有用 E2E 冒充物理音频/外部应用能力。

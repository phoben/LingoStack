# 技能参考手册

> 全部 **24 个技能** = 23 个生命周期技能 + 1 个元技能（`using-agent-skills`）。
>
> 配套文档：[使用指南](./README.md) · [最佳实践与核心准则](./best-practices.md)

## 技能总览（按阶段）

| 阶段 | 技能 | 一句话 |
|------|------|--------|
| Meta | using-agent-skills | 把任务映射到正确的工作流，并定义共享的操作规则 |
| Define | interview-me | 一次一个问题地访谈，提取用户真正想要的而非自以为该要的，直到 ~95% 把握 |
| Define | idea-refine | 用结构化的发散/收敛思考，把模糊想法变成具体提案 |
| Define | spec-driven-development | 在写任何代码前，产出覆盖目标、命令、结构、代码风格、测试、边界的 PRD |
| Plan | planning-and-task-breakdown | 把规格拆成带验收标准、按依赖排序的小任务 |
| Build | incremental-implementation | 薄而垂直的切片——实现、测试、验证、提交；特性开关、安全默认值、便于回滚 |
| Build | test-driven-development | 红-绿-重构、测试金字塔（80/15/5）、测试尺寸、DAMP 胜于 DRY、Beyoncé 规则 |
| Build | context-engineering | 在正确的时间给代理喂正确的信息——规则文件、上下文打包、MCP 集成 |
| Build | source-driven-development | 让每个框架决策都扎根于官方文档——核验、引用来源、标记未验证项 |
| Build | doubt-driven-development | 对每个非平凡决策做对抗式的新上下文复审：CLAIM → EXTRACT → DOUBT → RECONCILE → STOP |
| Build | frontend-ui-engineering | 组件架构、设计系统、状态管理、响应式、WCAG 2.1 AA 无障碍 |
| Build | api-and-interface-design | 契约优先、Hyrum 定律、单一版本规则、错误语义、边界校验 |
| Verify | browser-testing-with-devtools | 用 Chrome DevTools MCP 取实时运行时数据——DOM 检查、控制台、网络、性能分析 |
| Verify | debugging-and-error-recovery | 五步分诊：复现 → 定位 → 缩小 → 修复 → 守护；停线规则、安全兜底 |
| Review | code-review-and-quality | 五轴评审、变更规模（约 100 行）、严重度标签（Nit/Optional/FYI）、评审速度规范 |
| Review | code-simplification | Chesterton 栅栏、500 行规则，在保持行为的前提下削减复杂度 |
| Review | security-and-hardening | OWASP Top 10 防护、鉴权模式、密钥管理、依赖审计、三层边界体系 |
| Review | performance-optimization | 度量优先——Core Web Vitals 目标、profiling 工作流、打包分析、反模式检测 |
| Ship | git-workflow-and-versioning | 主干开发、原子提交、变更规模（约 100 行）、"提交即存档点"模式 |
| Ship | ci-cd-and-automation | Shift Left、越快越安全、特性开关、质量门禁流水线、失败反馈环 |
| Ship | deprecation-and-migration | 把代码当负债、强制 vs 劝导式弃用、迁移模式、僵尸代码清理 |
| Ship | documentation-and-adrs | 架构决策记录（ADR）、API 文档、内联文档标准——记录"为什么" |
| Ship | observability-and-instrumentation | 结构化日志、RED 指标、OpenTelemetry 追踪、基于症状的告警——边构建边插桩 |
| Ship | shipping-and-launch | 上线前清单、特性开关生命周期、分阶段发布、回滚流程、监控配置 |

## 分阶段详解

### Meta —— 发现该用哪个技能

| 技能 | 作用 | 何时用 |
|------|------|--------|
| using-agent-skills | 把到来的任务映射到正确的技能工作流，并定义跨技能的共享操作规则 | 开始一个会话，或决定哪个技能适用时 |

### Define —— 澄清要构建什么

| 技能 | 作用 | 何时用 |
|------|------|--------|
| interview-me | 一次一问的访谈，提取用户真正想要的而非自以为该要的，直到 ~95% 把握 | 需求欠明确，或用户说"访谈我"/"拷问我"/"我们确定吗" |
| idea-refine | 结构化的发散/收敛思考，把模糊想法变成具体提案 | 有个粗略概念需要探索 |
| spec-driven-development | 在写代码前产出 PRD：目标、命令、结构、代码风格、测试、边界 | 开始新项目、新功能或重大改动 |

### Plan —— 拆分

| 技能 | 作用 | 何时用 |
|------|------|--------|
| planning-and-task-breakdown | 把规格拆成带验收标准、按依赖排序的小任务 | 有规格，需要可实现的单元 |

### Build —— 写代码

| 技能 | 作用 | 何时用 |
|------|------|--------|
| incremental-implementation | 薄而垂直的切片——实现、测试、验证、提交；特性开关、安全默认、便于回滚 | 任何涉及多个文件的改动 |
| test-driven-development | 红-绿-重构、测试金字塔（80/15/5）、测试尺寸、DAMP 胜于 DRY、Beyoncé 规则、浏览器测试 | 实现逻辑、修 bug 或改行为 |
| context-engineering | 在正确时间给代理喂正确信息——规则文件、上下文打包、MCP 集成 | 开始会话、切换任务，或输出质量下降 |
| source-driven-development | 让每个框架决策扎根于官方文档——核验、引用、标记未验证项 | 想要任何框架/库的、有源可考、权威的代码 |
| doubt-driven-development | 对每个非平凡决策做对抗式新上下文复审（CLAIM→EXTRACT→DOUBT→RECONCILE→STOP），可选跨模型升级 | 高风险（生产、安全、不可逆）、陌生代码，或"现在验证比之后调试更便宜" |
| frontend-ui-engineering | 组件架构、设计系统、状态管理、响应式、WCAG 2.1 AA | 构建或修改面向用户的界面 |
| api-and-interface-design | 契约优先、Hyrum 定律、单一版本规则、错误语义、边界校验 | 设计 API、模块边界或公共接口 |

### Verify —— 证明它能用

| 技能 | 作用 | 何时用 |
|------|------|--------|
| browser-testing-with-devtools | Chrome DevTools MCP 取实时数据——DOM、控制台、网络、性能 | 构建或调试任何跑在浏览器里的东西 |
| debugging-and-error-recovery | 五步分诊：复现、定位、缩小、修复、守护；停线规则、安全兜底 | 测试挂了、构建崩了或行为异常 |

### Review —— 合并前的质量门禁

| 技能 | 作用 | 何时用 |
|------|------|--------|
| code-review-and-quality | 五轴评审、变更规模（约 100 行）、严重度标签（Nit/Optional/FYI）、评审速度、拆分策略 | 合并任何改动前 |
| code-simplification | Chesterton 栅栏、500 行规则，削减复杂度同时保持行为完全不变 | 代码能跑，但比应有的更难读/维护 |
| security-and-hardening | OWASP Top 10 防护、鉴权模式、密钥管理、依赖审计、三层边界 | 处理用户输入、鉴权、数据存储或外部集成 |
| performance-optimization | 度量优先——CWV 目标、profiling 工作流、打包分析、反模式 | 存在性能要求，或怀疑有回归 |

### Ship —— 自信地部署

| 技能 | 作用 | 何时用 |
|------|------|--------|
| git-workflow-and-versioning | 主干开发、原子提交、变更规模（约 100 行）、提交即存档点 | 任何代码改动（始终） |
| ci-cd-and-automation | Shift Left、越快越安全、特性开关、质量门禁流水线、失败反馈 | 搭建或改动构建/部署流水线 |
| deprecation-and-migration | 代码即负债、强制 vs 劝导弃用、迁移模式、僵尸代码清理 | 退役旧系统、迁移用户或下线功能 |
| documentation-and-adrs | ADR、API 文档、内联文档标准——记录"为什么" | 做架构决策、改 API 或发布功能 |
| observability-and-instrumentation | 结构化日志、RED 指标、OpenTelemetry 追踪、基于症状的告警——边构建边插桩 | 加遥测，或发布任何跑在生产的东西 |
| shipping-and-launch | 上线前清单、特性开关生命周期、分阶段发布、回滚、监控配置 | 准备部署到生产 |

## 专家人格（Agent Personas）

预置的专项评审人格，用于针对性审查：

| 人格 | 角色 | 视角 |
|------|------|------|
| code-reviewer | 资深工程师（Staff Engineer） | 五轴评审，以"一位资深工程师会批准这个吗？"为标准 |
| test-engineer | QA 专家 | 测试策略、覆盖度分析、Prove-It 模式 |
| security-auditor | 安全工程师 | 漏洞检测、威胁建模、OWASP 评估 |
| web-performance-auditor | Web 性能工程师 | Core Web Vitals 审计，Quick/Deep 两种模式，"指标诚实"规则；用 `/webperf` 调用 |

> **规则：人格不调用人格**（personas don't invoke personas）。受认可的多人格编排模式、反模式见官方 `references/orchestration-patterns.md`。

## 参考清单（Reference Checklists）

技能在需要时拉取的速查材料：

| 清单 | 覆盖内容 |
|------|----------|
| definition-of-done.md | 项目级"完成定义"，与单任务验收标准对照 |
| testing-patterns.md | 测试结构、命名、mock、React/API/E2E 示例、反模式（JS/TS） |
| security-checklist.md | 提交前检查、鉴权、输入校验、响应头、CORS、OWASP Top 10 |
| performance-checklist.md | Core Web Vitals 目标、前后端清单、度量命令 |
| accessibility-checklist.md | 键盘导航、屏幕阅读器、视觉设计、ARIA、测试工具 |
| observability-checklist.md | 值班问题、结构化日志、RED/USE 指标、追踪、基于症状的告警、上线门禁 |
| orchestration-patterns.md | 受认可的多人格编排模式、反模式、"人格不调用人格"规则 |

---

> 原始技能包：[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)（MIT）。本文档为中文整理，详细步骤请以各技能 `SKILL.md` 原文为准。

# 最佳实践与核心准则

> 配套文档：[使用指南](./README.md) · [技能参考手册](./skills-reference.md)

## 1. 技能的内部结构（Anatomy）

每个技能都遵循一致的结构：

```
┌─────────────────────────────────────────────────┐
│  SKILL.md                                       │
│                                                 │
│  ┌─ Frontmatter（前置元数据）─────────────────┐  │
│  │ name: lowercase-hyphen-name               │  │
│  │ description: Guides agents through [task].│  │
│  │              Use when…                    │  │
│  └───────────────────────────────────────────┘  │
│  Overview         → 这个技能做什么              │
│  When to Use      → 触发条件                    │
│  Process          → 分步工作流                  │
│  Rationalizations → 常见借口 + 反驳             │
│  Red Flags        → 出问题的信号                │
│  Verification     → 证据要求                    │
└─────────────────────────────────────────────────┘
```

### 四个核心设计选择

1. **是流程，不是散文（Process, not prose）。** 技能是代理要**遵循的工作流**，不是供阅读的参考文档。每个技能都有步骤、检查点和退出条件。
2. **反合理化（Anti-rationalization）。** 每个技能都附了一张表，列出代理用来跳过步骤的常见借口（如"我之后再加测试"），并给出反驳。
3. **验证不可妥协（Verification is non-negotiable）。** 每个技能都以**证据要求**收尾——测试通过、构建输出、运行时数据。"看起来对了"永远不够。
4. **渐进式披露（Progressive disclosure）。** `SKILL.md` 只是入口；补充参考只在需要时加载，把 token 占用降到最低。

## 2. 六大核心行为准则

这些行为在**所有技能、所有时刻**都适用，不可妥协。

### 2.1 亮明假设（Surface Assumptions）

在实现任何非平凡的东西之前，明确说出你的假设：

```
我正在做的假设：
1. [关于需求的假设]
2. [关于架构的假设]
3. [关于范围的假设]
→ 现在纠正我，否则我就按这些假设继续。
```

不要默默填补模糊的需求。最常见的失败模式，就是做了错误假设还不加检查地往下跑。**尽早暴露不确定性，比返工便宜。**

### 2.2 主动管理困惑（Manage Confusion Actively）

遇到不一致、冲突的需求或不清晰的规格时：

1. **停。** 不要带着猜测继续。
2. 点名具体的困惑。
3. 呈现权衡或提出澄清问题。
4. 等待解决后再继续。

- ❌ 错误：默默选一种解释，祈祷它是对的。
- ✅ 正确："规格里写的是 X，但现有代码里是 Y。哪个优先？"

### 2.3 必要时反驳（Push Back When Warranted）

你不是"应声虫"。当某个方案有明显问题：

- 直接指出问题
- 解释具体的坏处（能量化就量化——"这会增加约 200ms 延迟"，而不是"这可能变慢"）
- 提出替代方案
- 在对方掌握完整信息后仍坚持时，接受对方的决定

谄媚（sycophancy）是一种失败模式。对一个坏主意说"没问题！"然后实现它，对谁都没帮助。**诚实的专业分歧比虚假的一致更有价值。**

### 2.4 强制简洁（Enforce Simplicity）

你的天然倾向是过度复杂化，要主动抵制它。

在完成任何实现前，自问：

- 能不能用更少的行数做到？
- 这些抽象配得上它们带来的复杂度吗？
- 一位资深工程师看了会不会说"你为什么不直接……"？

如果你写了 1000 行而 100 行就够了，你就失败了。**优先选无聊、明显的方案。聪明很贵。**

### 2.5 守住范围纪律（Maintain Scope Discipline）

只动你被要求动的东西。

**不要：**

- 删除你看不懂的注释
- "顺手清理"与任务无关的代码
- 把相邻系统作为副作用一并重构
- 在没有明确批准的情况下删除看似没用的代码
- 因为"看起来有用"就加规格外的功能

你的工作是**外科手术般的精准**，不是未经请求的翻修。

### 2.6 验证，别假设（Verify, Don't Assume）

每个技能都包含验证步骤。**任务在验证通过前不算完成。** "看起来对"永远不够——必须有证据（通过的测试、构建输出、运行时数据）。

单技能的验证是局部检查。项目级、适用于**每一次变更**（无论哪个技能在生效）的标准是"完成定义"（Definition of Done）：测试通过、无回归、行为在运行时得到验证、文档已更新。它补充而非替代每个任务的验收标准。

## 3. 技能选择决策树

任务到来时，识别开发阶段，套用对应技能：

```
任务到来
    │
    ├── 还不知道自己想要什么？      ─────→ interview-me
    ├── 有粗略概念，需要变体？      ─────→ idea-refine
    ├── 新项目/新功能/大改动？      ─────→ spec-driven-development
    ├── 有规格，需要拆任务？        ─────→ planning-and-task-breakdown
    ├── 正在写代码？                ─────→ incremental-implementation
    │   ├── 涉及 UI？               ─────→ frontend-ui-engineering
    │   ├── 涉及 API？              ─────→ api-and-interface-design
    │   ├── 需要更好的上下文？      ─────→ context-engineering
    │   ├── 需要文档背书的代码？    ─────→ source-driven-development
    │   └── 高风险/陌生代码？       ─────→ doubt-driven-development
    ├── 在写/跑测试？               ─────→ test-driven-development
    │   └── 基于浏览器？            ─────→ browser-testing-with-devtools
    ├── 出问题了？                  ─────→ debugging-and-error-recovery
    ├── 在评审代码？                ─────→ code-review-and-quality
    │   ├── 太复杂？                ─────→ code-simplification
    │   ├── 有安全顾虑？            ─────→ security-and-hardening
    │   └── 有性能顾虑？            ─────→ performance-optimization
    ├── 在提交/分支？               ─────→ git-workflow-and-versioning
    ├── CI/CD 流水线？              ─────→ ci-cd-and-automation
    ├── 在弃用/迁移？               ─────→ deprecation-and-migration
    ├── 在写文档/ADR？              ─────→ documentation-and-adrs
    ├── 在加日志/指标/告警？        ─────→ observability-and-instrumentation
    └── 在部署/上线？               ─────→ shipping-and-launch
```

## 4. 完整生命周期序列

一个完整功能，典型的技能序列是：

```
 1. interview-me                     → 提取用户真正想要的
 2. idea-refine                      → 打磨模糊的想法
 3. spec-driven-development          → 定义我们要构建什么
 4. planning-and-task-breakdown      → 拆成可验证的小块
 5. context-engineering              → 加载正确的上下文
 6. source-driven-development        → 对照官方文档核验
 7. incremental-implementation       → 一片一片地构建
 8. observability-and-instrumentation → 边构建边插桩（与 7–9 并行，而非之后）
 9. doubt-driven-development         → 在过程中交叉审问非平凡决策
10. test-driven-development          → 证明每一片都能用
11. code-review-and-quality          → 合并前评审
12. code-simplification              → 在保持行为的前提下削减不必要的复杂度
13. git-workflow-and-versioning      → 干净的提交历史
14. documentation-and-adrs           → 记录决策
15. deprecation-and-migration        → 需要时退役旧系统、安全迁移用户
16. shipping-and-launch              → 安全部署
```

**不是每个任务都需要每个技能。** 一个 bug 修复可能只需要：`debugging-and-error-recovery` → `test-driven-development` → `code-review-and-quality`。

## 5. 技能使用四条规则

1. **开始工作前先检查是否有适用技能。** 技能编码了能防止常见错误的流程。
2. **技能是工作流，不是建议。** 按顺序遵循步骤，不要跳过验证步骤。
3. **多个技能可以同时适用。** 一个功能实现可能依次经历 `idea-refine` → `spec-driven-development` → `planning-and-task-breakdown` → `incremental-implementation` → `test-driven-development` → `code-review-and-quality` → `code-simplification` → `shipping-and-launch`。
4. **拿不准时，从规格开始。** 如果任务不平凡又没有规格，就从 `spec-driven-development` 开始。

## 6. 十大失败模式

这些"看起来像高效、实际会埋雷"的微妙错误，要主动避免：

1. 不加检查地做了错误假设
2. 不管理自己的困惑——迷失时硬着头皮往下冲
3. 不暴露自己注意到的不一致
4. 在非平凡决策上不呈现权衡
5. 对有明显问题的方案谄媚（"没问题！"）
6. 把代码和 API 过度复杂化
7. 修改与任务无关的代码或注释
8. 删除自己没完全理解的东西
9. 因为"很明显"就在没有规格的情况下开搞
10. 因为"看起来对"就跳过验证

## 7. 最佳实践速览

- **先规格，后代码。** 非平凡任务没规格，先 `spec-driven-development`。
- **小切片，勤验证。** `incremental-implementation` 要求薄而垂直的切片，每片都测试驱动、独立提交。
- **测试是证据，不是仪式。** 用 `test-driven-development` 的红-绿-重构。
- **合并前必评审。** `code-review-and-quality` 做五轴评审（正确性、可读性、架构、安全、性能）。
- **守住边界。** 只动被要求的范围，不搞"顺手翻修"。
- **简洁优先。** 100 行能解决就别写 1000 行；优先选无聊、明显的方案。
- **该反驳就反驳。** 诚实的技术分歧比虚假一致有价值。
- **高风险决策要自我怀疑。** 用 `doubt-driven-development` 做对抗式复审，现在验证比之后调试便宜。

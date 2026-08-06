# Agent Skills 使用指南

> 本文档基于 [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)（MIT 许可证）整理，介绍该技能包的理念、安装、命令与最佳实践。
>
> 配套文档：[最佳实践与核心准则](./best-practices.md) · [技能参考手册](./skills-reference.md)

## 1. 它是什么

**Agent Skills** 是一组面向 AI 编码代理（AI coding agents）的**生产级工程技能**。每个技能把资深工程师构建软件时遵循的工作流、质量门禁与最佳实践，编码成结构化的流程，让 AI 代理在开发的每个阶段都能一致地遵循。

一句话定位：

> Skills encode the workflows, quality gates, and best practices that senior engineers use when building software.

技能包共 **24 个技能**（23 个生命周期技能 + 1 个元技能）、**8 个斜杠命令**、**4 个专家人格**、**7 张参考清单**。

### 1.1 为什么需要

AI 编码代理默认走"最短路径"——这往往意味着跳过规格说明、测试、安全审查，以及那些让软件可靠的工程实践。Agent Skills 给代理提供**结构化的工作流**，强制执行资深工程师对待生产代码时的同等纪律。

每个技能都内化了来之不易的工程判断：**何时**写规格、**测什么**、**如何**评审、**何时**发布。这些技能融入了 Google 工程文化中的实践（出自 *Software Engineering at Google* 与 Google 工程实践指南），例如：

- API 设计中的 **Hyrum 定律**
- 测试中的 **Beyoncé 规则**与**测试金字塔**
- 代码评审中的**变更规模**与**评审速度**规范
- 简化中的 **Chesterton 栅栏**原则
- Git 工作流中的**主干开发**（trunk-based）
- CI/CD 中的 **Shift Left** 与**特性开关**
- 专门的**弃用技能**，把代码视为负债

## 2. 核心理念：开发生命周期

整个技能包围绕一条开发生命周期组织，分为六个阶段：

```
  DEFINE          PLAN           BUILD          VERIFY         REVIEW          SHIP
 ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐      ┌──────┐
 │ Idea │ ───▶ │ Spec │ ───▶ │ Code │ ───▶ │ Test │ ───▶ │  QA  │ ───▶ │  Go  │
 │Refine│      │  PRD │      │ Impl │      │Debug │      │ Gate │      │ Live │
 └──────┘      └──────┘      └──────┘      └──────┘      └──────┘      └──────┘
  /spec          /plan          /build        /test         /review       /ship
```

8 个斜杠命令是入口，每个命令会自动激活对应的技能。技能也会根据你正在做的事**自动激活**——设计 API 会触发 `api-and-interface-design`，构建 UI 会触发 `frontend-ui-engineering`，以此类推。

## 3. 安装

### 3.1 通用方式：open skills CLI（支持 70+ 代理）

```bash
npx skills add addyosmani/agent-skills            # 安装全部 24 个技能
npx skills add addyosmani/agent-skills --list     # 先浏览再安装
```

只安装单个技能：

```bash
npx skills add addyosmani/agent-skills --skill code-review-and-quality
npx skills add addyosmani/agent-skills --skill interview-me
npx skills add addyosmani/agent-skills --skill test-driven-development
```

> **注意**：用 `npx` 单独安装某个技能时，只会复制 `skills/<name>/`，**不包含**仓库级的 `references/` 目录。技能本身仍可用，但对补充共享清单的路径引用会失效。建议使用整仓库集成、克隆仓库，或把所需清单复制到该技能内的 `references/` 目录。

### 3.2 Claude Code（推荐）

**市场安装：**

```
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills
```

> **遇到 SSH 错误？** 市场通过 SSH 克隆仓库。若 GitHub 未配置 SSH 密钥，可改用完整 HTTPS URL：
>
> ```
> /plugin marketplace add https://github.com/addyosmani/agent-skills.git
> /plugin install agent-skills@addy-agent-skills
> ```
>
> 若在 Windows/macOS 上仍报 `git@github.com: Permission denied (publickey)`，可全局配置 Git 把 GitHub SSH URL 改写为 HTTPS：
>
> ```bash
> git config --global url."https://github.com/".insteadOf git@github.com:
> ```

**本地/开发：**

```bash
git clone https://github.com/addyosmani/agent-skills.git
claude --plugin-dir /path/to/agent-skills
```

### 3.3 其他代理

| 代理 | 安装要点 |
|------|----------|
| Cursor | 工作流技能放 `.cursor/skills/`（从 `agent-skills/skills/` 同步），简短策略放 `.cursor/rules/*.mdc`，不要把完整技能粘贴进 rules |
| Antigravity CLI | `agy plugin install https://github.com/addyosmani/agent-skills.git` |
| Gemini CLI | `gemini skills install https://github.com/addyosmani/agent-skills.git --path skills` |
| Windsurf | 把技能内容加入 Windsurf rules 配置 |
| OpenCode | 通过 `AGENTS.md` 与 `skill` 工具驱动 |
| GitHub Copilot | `agents/` 作为 Copilot 人格，技能内容放 `.github/copilot-instructions.md` |
| Codex | `codex plugin marketplace add addyosmani/agent-skills`（v0.122+，用 `@` 调用，如 `@spec-driven-development`） |

技能本质是**纯 Markdown**，任何接受系统提示或指令文件的代理都能用。

## 4. 斜杠命令

8 个命令，映射到开发生命周期，各自自动激活相应技能：

| 你在做什么 | 命令 | 核心原则 |
|------------|------|----------|
| 定义要构建什么 | `/spec` | 先写规格，再写代码 |
| 规划如何构建 | `/plan` | 拆成小而原子化的任务 |
| 增量构建 | `/build` | 一次一个切片 |
| 证明它能用 | `/test` | 测试即证据 |
| 合并前评审 | `/review` | 提升代码健康度 |
| 审计 Web 性能 | `/webperf` | 先度量，再优化 |
| 简化代码 | `/code-simplify` | 清晰胜于取巧 |
| 发布到生产 | `/ship` | 越快越安全 |

## 5. 快速开始

最简路径（任一支持斜杠命令的代理）：

1. 按第 3 节安装技能包。
2. 用 `/spec` 描述你想构建的东西，让代理产出规格。
3. 用 `/plan` 把规格拆成可验证的任务。
4. 用 `/build` 逐个切片实现（每个切片都测试驱动、独立提交）。
5. 用 `/review` 做五轴代码评审，用 `/ship` 发布。

### `/build auto` —— 一次性自动实现

规格定好后，用 `/build auto` 可以减少手动步骤：**一次批准计划**后，它会自动实现每一个任务，无需人工在任务之间介入。

关键在于——**它去掉的是任务之间的人工介入，而非验证**：

- 每个任务仍是**测试驱动**、**独立提交**
- 遇到**失败或高风险步骤会暂停**，等你处理

适用场景：规格清晰、任务边界明确、风险可控的功能开发。不适用于探索性、高风险或需要频繁人工判断的工作。

## 6. 文档导航

- [最佳实践与核心准则](./best-practices.md) —— 技能的内部结构、六大核心行为准则、技能选择决策树、完整生命周期、十大失败模式。
- [技能参考手册](./skills-reference.md) —— 24 个技能按阶段索引、4 个专家人格、7 张参考清单。

---

> 原项目作者：Addy Osmani（@addyosmani）、Federico Bartoli（@federicobartoli）、Joan León（@nucliweb）。许可证：MIT。

# 贡献指南

感谢你对 LingoStack（译栈）的兴趣！本文档帮助你快速参与开发。完整产品设计见 [`docs/lingostack-design.md`](docs/lingostack-design.md)，工程约定见 [`CLAUDE.md`](CLAUDE.md)——两者冲突以设计文档为准。

## 开发环境

| 依赖 | 版本 | 说明 |
|------|------|------|
| Rust | stable（见 `rust-toolchain.toml`） | 工具链由仓库固定 |
| Node.js | ≥ 22 | 前端构建 |
| pnpm | 10 | 包管理器（见 `package.json` 的 `packageManager`） |
| Windows | 10/11 + MSVC Build Tools | 「使用 C++ 的桌面开发」工作负载；主开发平台 |
| macOS / Linux | — | 平台能力代码需在目标平台验证（见下） |

初次拉取后：

```bash
pnpm install
pnpm tauri dev          # 启动开发：Vite + Rust + 主窗口
```

## 仓库布局

7 个 Rust crate（`crates/*` 六个 + `src-tauri` 入口）+ React 前端（仓库根 `src/`）。详细到每个目录的说明见 [`CLAUDE.md` 的「仓库布局」](CLAUDE.md#仓库布局)。

几个关键约束（违反会被 CI 拦截或 review 打回）：

- **`lingostack-core` 必须纯净**：不依赖 `tauri`，仅含可独立单测的纯逻辑。CI 用 `cargo tree -p lingostack-core | grep tauri` 校验。
- **平台差异用 trait + `#[cfg(target_os)]` 分文件隔离**：取词 / 热键 / TTS 等分平台实现，**禁止在调用侧写 `if windows/mac` 分支**。
- **LLM 适配只暴露 `LlmProvider` trait**：功能层禁止直连具体提供商。
- **API Key 绝不进日志、崩溃报告、Issue 或任何上传内容。**

## 常用命令

```bash
# Rust
cargo fmt --all --check           # 格式检查
cargo clippy --all-targets -- -D warnings   # 零警告
cargo test --workspace            # 全部测试

# 前端
pnpm lint                         # eslint --max-warnings 0
pnpm test                         # vitest run
pnpm build                        # tsc --noEmit + vite build

# 端到端
pnpm tauri dev                    # 启动开发
pnpm tauri build                  # 打包

# 依赖漏洞扫描（CI 门禁，见 .github/workflows/audit.yml）
cargo audit                       # 需先 cargo install cargo-audit --locked
pnpm audit --audit-level high
```

> `pnpm audit` 依赖 registry 提供 audit endpoint。若你配置了国内 npm 镜像
> （如 npmmirror），本地会报 `ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`——属预期，
> CI 走官方 registry 可正常扫描，以 CI 结果为准。

## 工作流

1. **Fork → 分支**：从 `develop` 拉特性分支（`feat/…` / `fix/…` / `docs/…`）。
2. **开发**：遵循下述代码规范；新功能必须带测试。
3. **本地自测**：跑完上面的「常用命令」，确保全绿。
4. **提交**：Conventional Commits + DCO（见下）。
5. **PR → `develop`**：填写 PR 模板的自测清单，等待 review。

### 分支策略

- `main`：稳定，仅通过 `develop` 合并发布。
- `develop`：集成主干，PR 默认目标。
- `feat/*` / `fix/*` / `docs/*`：特性分支。

## 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)，可附中文描述：

```
feat(llm): Anthropic 原生协议适配器（A2b）
fix(selection): UIA 取词在终端应用上降级剪贴板
docs: 同步设计文档窗口架构
chore(deps): 升级 reqwest 到 0.12.4
```

类型：`feat` / `fix` / `docs` / `chore` / `refactor` / `test` / `ci` / `style`。

### DCO（Developer Certificate of Origin）

每个 commit 必须含 `Signed-off-by`，表明你拥有该贡献的提交权。用 `git commit -s` 自动添加：

```
Author: Your Name <you@example.com>
Signed-off-by: Your Name <you@example.com>
```

CI 会校验 DCO（`.github/workflows/dco.yml`）。**没有 `Signed-off-by` 的 PR 无法合并。**

两类 commit 例外：

- **合并 commit**：由 GitHub 生成、无法附带签名，自动豁免。
- **DCO 立项前的历史 commit**：已发布到共享分支、不可重写，在校验脚本的 `GRANDFATHERED` 列表中按 SHA 逐条豁免。该列表已封闭，**新 commit 一律不得加入**。

## 代码规范

### Rust

- `cargo fmt` + `cargo clippy -D warnings` 必须通过（CI 三平台均跑）。
- 平台相关代码按 target 分文件（见 `lingostack-selection/src/{windows,macos,linux}.rs`）。
- `unsafe` 块局部化并标注 `// SAFETY:` 前提。
- 错误不吞：用 `Result` + `thiserror`，避免 `unwrap()` 进生产路径。

### 前端

- ESLint `--max-warnings 0`；TypeScript 严格模式，禁止 `any` 滥用。
- 新增组件默认用 shadcn/ui 原语（`src/components/ui/`）。
- **设计先行**：动 UI 前先查 [`/lingostack-design`](.claude/skills/lingostack-design) 技能与原型稿，优先按原型实现。

## 平台能力说明

主开发平台为 Windows，以下能力已在 Windows 实跑验证：

- 取词：UI Automation（`lingostack-selection`）
- 全局热键：`tauri-plugin-global-shortcut`
- 朗读：SAPI（`lingostack-tts`）

macOS（Accessibility API / AVSpeechSynthesizer）与 Linux（AT-SPI / speech-dispatcher）目前为占位实现，返回 `Unsupported`，各文件已标注所需 API。在这些平台上的贡献**需要你在目标平台实跑验证**——请在 PR 说明中注明测试环境。

## 安全

- **API Key 绝不粘贴到 Issue / PR / 截图 / 日志。** 报 Bug 时如有需要，提供脱敏后的描述。
- 若发现安全漏洞，请按 [`SECURITY.md`](SECURITY.md) 的私密流程上报，**不要开公开 Issue**。

## 行为准则

参与本项目即表示你同意遵守 [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)。请在交流中保持尊重与建设性。

---

再次感谢你的贡献！如有疑问，开 Issue 讨论即可。

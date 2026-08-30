# Implement · 翻译与命名体验优化（issue #2）

## 顺序清单

分三块推进，块间可独立验证与回滚（见 design.md §5）。

### 块 1 · 跨页面任务保活（R7）

- [ ] 1.1 新建 `src/stores/stream-store.ts`：`StreamTask` 形状 + `start` / `reset` /
      `setInput`，`seq` 守卫丢弃过期回调（design.md §1.2）。
- [ ] 1.2 新建 `src/stores/stream-store.test.ts`：
      - 增量累积到 `output`，`done` 置 `done`，`error` 置 `error` 且保留已累积内容
      - 连续两次 `start`，旧流的迟到增量被丢弃（`seq` 守卫）
      - 两个 feature 同时 streaming 互不干扰
- [ ] 1.3 `translate-view.tsx` 接入：移除 `source`/`target`/`status`/`errorMsg`
      四个本地 state，改读 store；`injectSource` 通路保留。
- [ ] 1.4 `naming-view.tsx` 接入：移除 `desc`/`raw`/`status`/`errorMsg`，改读 store。
- [ ] 1.5 验证 AC7（prd.md）：`pnpm tauri dev` → 翻译页发起 → 立刻切收藏页 →
      数秒后切回，译文含期间全部内容、原文框内容仍在；命名页同样。

### 块 2 · 命名页改版（R1/R2/R3）

- [ ] 2.1 `crates/lingostack-core/src/prompts/naming.txt` 改为产出 5 行
      小写空格分隔英文词组，不带写法修饰。
- [ ] 2.2 `crates/lingostack-core/src/prompt.rs` 断言同步：`{style}` 占位符断言
      （`:105`）改为断言新的风格约束；`all_prompts_are_structurally_sound`（`:117`）
      的行数 / 长度门槛复核。
- [ ] 2.3 新建 `src/lib/case-convert.ts`：`toStyle(words, style)`，切词 + 五种拼接。
- [ ] 2.4 新建 `src/lib/case-convert.test.ts`：五种写法各自正确；多空格 / 连字符 /
      已是驼峰的输入都能正确切词；单词输入；空输入。
- [ ] 2.5 `src/lib/naming.ts` 增 `buildNamingGrid(raw)`：复用 `parseCandidates`，
      每行产出五种写法；超过 5 行取前 5。既有 `parseCandidates` 与其测试不动。
- [ ] 2.6 `src/lib/naming.test.ts` 补 `buildNamingGrid` 用例（行数上限、行内五列齐全、
      空输入返回空）。
- [ ] 2.7 `naming-view.tsx` 布局：工具条只留居中输入框 + 生成按钮（去标签、去规范切换条、
      去 `style` state）；内容区 `grid-cols-5` 五张卡片，卡内 `divide-y` 五行；
      去掉底部模型标注（R5）与闪烁块（R6）；复制反馈用列+行复合键。

### 块 3 · 翻译页调整（R4/R5/R6）

- [ ] 3.1 原文面板顶栏：字符数换成朗读/收藏/复制三按钮；朗读读原文、复制复制原文；
      收藏在原文与译文都非空时可用。
- [ ] 3.2 译文面板：顶栏去掉模型名（R5），底栏三按钮由 `ml-auto` 改左对齐。
- [ ] 3.3 去掉译文流式闪烁竖条（`:241`）；进度靠工具条既有状态标记（R6）。
- [ ] 3.4 `modelLabel` 计算逻辑随之删除（两个视图都不再显示模型）。

### 收尾

- [ ] 4.1 `CLAUDE.md` 仓库布局章节补 `stores/stream-store` 与 `lib/case-convert`
      （项目约定要求结构变动即时同步）。
- [ ] 4.2 全量门禁（下方命令）。
- [ ] 4.3 手工走 AC1–AC7。

## 验证命令

```bash
pnpm lint
pnpm test
pnpm build
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo tree -p lingostack-core | grep tauri   # 应无输出（core 纯净性）
```

`pnpm tauri dev` 用于 AC7 与视觉核对；跑真实翻译需设置页已配好提供商与密钥。

## 风险文件

| 文件 | 风险 | 应对 |
|------|------|------|
| `src/App.tsx` | 视图渲染方式不改（仍条件渲染），仅确认无需改 | 若块 1 后仍丢状态，说明有遗漏的本地 state |
| `crates/lingostack-core/src/prompts/naming.txt` | 唯一跨前后端改动；改坏会让命名产出退化 | 断言守住风格；改动在 PR 中说明动机（prompt.rs 模块注释要求） |
| `src/lib/naming.ts` | `parseCandidates` 被既有 7 条测试覆盖 | 只增不改，测试须全绿 |
| `translate-view.tsx` / `naming-view.tsx` | 大面积重写，易漏 `aria-label` / 焦点环 | 对照设计规范交互契约复核 |

## 开始前确认

- 分支已在 `phoben/issue-2`（当前即是），提交遵循 Conventional Commits + `Signed-off-by`。
- 视觉改动须对齐 `.claude/skills/lingostack-design`：卡片形状、mono 用于标识符、
  hover 只提亮背景不灰化文字、每个可聚焦元素有焦点环。

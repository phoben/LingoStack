# 实施计划：翻译术语与收藏长文本布局

## 0. 开始条件

- [ ] 用户批准本任务最新的 PRD、design 与 implement 摘要。
- [ ] 仅在批准后的后续消息运行 `task.py start`；本规划回合不实施。
- [ ] 开始前重新检查 `git status`，保留当前 44 项既有未提交变更，不修改与本任务无关的文件。
- [ ] 实施代理先读取 `implement.jsonl`；检查代理读取 `check.jsonl`。

## 1. 建立失败基线

- [ ] 在 `lingostack-core` 增加术语解释语言测试：源语言为 English、解释语言分别为中文/English，断言受保护协议只跟随后者。
- [ ] 在 favorites pure helper/store/DB 测试中加入仅按术语文本的规范化匹配、解释变化仍点亮、空心新增、实心取消全部同词重复项和事务失败回滚场景，先观察旧实现缺能力或测试失败。
- [ ] 在术语组件测试中加入 Portal 归属、边缘 flip/clamp、持久收藏点亮与 `aria-pressed` 切换场景。
- [ ] 在收藏视图测试中加入长段落、连续路径与溢出测量场景，断言默认折叠、展开/收起及操作按钮持续可达。

证据：记录每组新测试在修复前的失败原因；现有测试失败与新增红测分开标注。

## 2. 修复术语解释语言契约

- [ ] 修改 `compose_translation_prompt`，使用显式 `explanation_language` 生成不可覆盖协议；不改 sentinel/JSON schema。
- [ ] 修改 `effective_translation_prompt` Rust command 与 `src/lib/ipc.ts` wrapper，增加实际界面语言参数。
- [ ] 在 `TranslateView` 中复用 `resolveLocale(uiLanguage)` 的结果，同时供语言计划与 Prompt 解释语言使用。
- [ ] 运行 `cargo test -p lingostack-core` 和相关前端组件测试，确认中英文界面与相反原文语言组合通过。

回滚点：该批只涉及 core Prompt、Tauri command、IPC wrapper 与调用点，可独立回退。

## 3. 增加可逆术语收藏能力

- [ ] 在 `favorites.ts` 增加按术语文本规范化的 identity/match helper，覆盖空白、大小写、CJK 和同词不同解释仍匹配。
- [ ] 在 `favorites-db.ts` 增加 id 数组的原子批量删除；空数组不得开启写事务。
- [ ] 在 `favorites-store.ts` 增加 `loaded` 与 `toggle`，实现乐观新增/批量取消、成功排序与失败精确回滚。
- [ ] `TranslateView`/`FavoritesView` 仅在未加载时触发 load，避免每次视图切换重复读取。
- [ ] 验证历史中同一规范化术语的多个不同 id/不同解释收藏，点击一次实心图标后全部删除；未点击前保留既有解释且不被新翻译静默覆盖。

回滚点：不升级 DB，不改记录结构；若 store 行为异常可删除新 action/helper，而既有数据仍兼容。

## 4. 提取术语标签并修复顶层浮层

- [ ] 新建业务组件 `src/components/term-tags.tsx`，迁移现有 hover/focus/Escape 语义与测试。
- [ ] 使用 `createPortal(document.body)` + fixed 坐标；实现下方优先、上方翻转、8px viewport clamp，以及 scroll/resize 重新定位。
- [ ] 给每个 tag 增加独立 Bookmark toggle，使用 Lucide、语义 token、本地化名称、`aria-pressed` 和进行中 disabled。
- [ ] 成功/失败反馈接入现有 Toast；错误由 favorites store 回滚后统一展示并清除。
- [ ] 保证 Portal 打开/关闭前后不成为译文 scrollport 的后代，真实窗口中不改变其可滚动范围。

回滚点：组件提取与调用替换保持单一边界，可恢复为旧 `TermTags` 而不影响 translation envelope。

## 5. 修复收藏长文本布局

- [ ] 把收藏行改为有界 grid；文本轨道使用 `minmax(0,...)`、`min-w-0` 与任意位置换行，操作区使用 auto 轨道。
- [ ] 增加视图局部的三行折叠/展开逻辑；仅真实溢出时显示按钮，使用 `aria-expanded` 与本地化文案。
- [ ] 用 ResizeObserver 响应窗口及侧栏宽度变化，并提供 mount/window resize 降级。
- [ ] 保留 divide-y、hover、搜索/筛选、TTS、删除、导入导出与空态现有行为。
- [ ] 使用截图同量级英文段落、中文释义、路径、URL 和无空格 token 验证默认 3 行、展开全文、收起恢复及无横向撑宽。

## 6. 自动化验证

快速反馈：

```powershell
pnpm vitest run src/lib/favorites.test.ts src/stores/favorites-store.test.ts src/components/term-tags.test.tsx src/components/views/favorites-view.test.tsx src/components/views/translate-view.test.tsx src/lib/translation-envelope.test.ts
cargo test -p lingostack-core
```

前端与 Rust 最终门禁：

```powershell
pnpm lint
pnpm test
pnpm build
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
git diff --check
```

跨 IPC / 真实桌面触发项：

```powershell
cargo test -p lingostack-app --features e2e
pnpm test:production-isolation
pnpm test:e2e
```

- [ ] E2E 新增或扩展术语 fixture 场景：术语可见、envelope 不泄漏、收藏空心→实心→收藏页可见→取消后消失。
- [ ] 所有命令记录退出码、测试文件/场景数与失败数；未运行项不得写成通过。

## 7. Windows 实窗验收

在 `pnpm tauri dev` 中分别记录默认窗口与 `864×576` 最小窗口：

- [ ] 中文界面 + English 原文：术语解释为中文。
- [ ] English 界面 + 中文原文：术语解释为 English。
- [ ] Tooltip 在译文滚动前后及窗口上/下/左/右边缘完整浮在内容之上，不新增水平/垂直滚动范围。
- [ ] 术语收藏新增后切换到收藏页可见；下一次翻译提取同词但不同解释时仍点亮；再次点击取消后该术语的历史重复项均从收藏页消失。
- [ ] 长英文段落、中文释义、长路径/URL 默认各最多 3 行；仅溢出时出现展开，展开后全文可读，收起恢复；朗读/删除始终位于视口内。
- [ ] 键盘 Tab/Shift+Tab、Enter/Space、Escape 可操作，焦点环清晰，Tooltip 与 Bookmark 的可访问名称正确。

证据等级：自动化为 local-runtime；截图/人工观察为 manual-system。不得用 JSDOM 断言代替 WebView 视觉结论。

## 8. 收尾

- [ ] 更新受影响的前端 UI/state/testing、core Prompt 与 app IPC spec，修正与当前源码不一致的旧占位符说明。
- [ ] 运行 Trellis check，逐条对照 R1–R5 与 AC1–AC8。
- [ ] 展示精确变更文件集与验证结果；未经用户另行授权不 commit、不 push、不 archive。

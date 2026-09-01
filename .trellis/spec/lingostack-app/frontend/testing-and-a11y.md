# 测试与可访问性

视觉和状态的呈现规则见 [UI 设计主契约](./ui-design.md)；本文规定怎样验证其语义与现有覆盖边界。

## Vitest 与组件测试

Toast 测试从用户可见文案与本地化通知区域查询，确认应用根部单实例、成功/失败路径与 Clipboard rejection；不要依赖第三方组件的内部 DOM。持续错误和可恢复操作仍验证原位置的 `role="alert"`。

`vite.config.ts:32-37`：`globals: true`、`environment: "jsdom"`、`setupFiles: ["./src/test-setup.ts"]`、`css: true`。`src/test-setup.ts` 引入 `@testing-library/jest-dom/vitest` 并手动桩 `window.matchMedia`；默认 `matches: false`，所以测试中的 system 主题解析为 light。

只 mock Tauri 边界，不 mock 自己的模块：

```ts
vi.mock("@tauri-apps/api/core", () => ({ invoke: ..., Channel: ... }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: ... }));
```

新测试把 `vi.mock` 写在相应模块 import 前（Vitest 会提升该调用）；现有窗口控制测试可参照 `title-bar.test.tsx` 的 `getCurrentWindow` mock。RTL 查询优先 `getByRole("button", { name })`，断言 `aria-current`、`aria-pressed`、`aria-busy` 等语义，而非实现类名。effect 有异步 promise 时用 `findByRole` 等待，以避免 `act(...)` 警告；模块加载期行为用 `vi.resetModules()` 加动态 import，参照 `theme-store.test.ts`。

当前覆盖包含 `lib/utils`、`lib/naming`、`lib/favorites`、`favorites-db`、app/theme/config/favorites/tts stores、`use-theme`、`Sidebar`、`TitleBar` 与 `App` 桌面事件。IndexedDB 测试用 `fake-indexeddb`，并必须清理数据库与 store 状态以避免用例串扰。各业务 views、`provider-form.tsx`、`settings-ai.tsx`、所有 `ui/` 原语和 `view-shell.tsx` 尚未完整覆盖；新功能必须随功能补测试，视图难测时先将纯逻辑抽到 `lib/`。

## 已有语义契约

- 图标按钮给可见或可读名称，通常为 `aria-label`；装饰图标为 `aria-hidden="true"`。
- 侧栏等当前导航选中项使用 `aria-current="page"`；开关型按钮使用 `aria-pressed`；`<nav>` 给 `aria-label`。
- 使用真 `<select>` 与 `<label htmlFor>` / `<input id>`，保留原生语义。
- 焦点既有全局 `:focus-visible`（`src/index.css:140-144`）也有原语的 `focus-visible:ring-2 focus-visible:ring-info/40`。

### 异步区域：现状与新增规则

当前不是“全站没有 live region”。以下已落地：

| 区域                                           | 当前语义                                               |
| ---------------------------------------------- | ------------------------------------------------------ |
| 翻译译文区（`translate-view.tsx:275-284`）     | `aria-live="polite"`、`aria-busy`；错误 `role="alert"` |
| 命名生成区（`naming-view.tsx:73-145`）         | `aria-live`、`aria-busy`；错误 `role="alert"`          |
| 收藏通知与错误（`favorites-view.tsx:140-154`） | 通知 `aria-live`；错误 `role="alert"`                  |
| 划词来源/失败（翻译页）                        | 剪贴板降级 `aria-live`；最终失败给手动粘贴建议         |
| TTS 错误（翻译/收藏页）                        | `role="alert"`；朗读与停止按钮名称随状态变化           |

新增会异步更新、但不必打断用户的结果或进度区域：在稳定容器上设置 `aria-live="polite"`，请求期间同步 `aria-busy`，完成后清除。需要立即打断且需要持续观察的失败信息使用 `role="alert"`，不要同时把同一错误重复置入 polite region。文档翻译的持久失败原因例外：按失败周期用 Toast 播报一次，列表状态和重试入口持续可见，reader 不重复放置该原因。测试至少断言忙碌、成功或空态、错误三种语义和文案变化。

设置加载/保存、提供商表单等异步文本尚未统一为 live region；改到这些区域时按上表补齐，而非声称全站已覆盖。设置二级导航不是完整 ARIA tabs，没有方向键焦点漫游；`docs-view.tsx` 三个占位图标按钮仍可聚焦；没有自动化 axe/jest-axe 门禁。它们都是当前缺口，不是已完成能力。

### AI 功能默认模型

`SettingsAi` 的功能模型选择器通过真实 `useConfigStore.update()` 保存，测试只 mock Tauri IPC 边界，不能 mock `SettingsAi` 或 store。翻译、命名和文档功能选择器的空选项必须清楚说明会使用全局默认模型；全局默认的空选项仍为未指定。文档翻译只能有一个本地化可访问名称为“文档” / “Document”的 selector。RTL 至少覆盖选择写入 `models.doc_translate` 并调用 `saveConfig`、清空、删除提供商时清理，以及中英文的唯一 selector 查询。

### 文档批量导入与辅助页面

- 文档批量导入测试必须断言 picker 使用 `multiple: true`，同批成功项各自启动翻译，拒绝项不启动翻译且页面出现 alert；不能只断言调用次数而忽略失败可见性。
- 文档列表项视觉上只保留图标与文件名；测试通过列表按钮的可访问名称验证本地化状态，同时断言状态/百分比没有额外可见行。不要把 `animate-spin` 等 Tailwind class 当成唯一行为断言；源码/样式检查另行确认 `motion-reduce` 降级。
- 文档阅读交互测试必须覆盖：点击 completed 记录默认请求 translation，点击其他状态默认请求 source；导入成功后自动选中 translation；translation + translating 时覆盖层为 `role=status` 且父区 `aria-busy=true`，不泄漏 source/partial content；completed 后覆盖层消失并显示完整译文。非译文加载及已取消/不支持状态不得伪装为 busy；当前记录的快照更新不得覆盖用户手动选择的 radio。右键菜单的显式原文/译文操作不得被自动策略覆盖。
- 外观设置测试按本地化 radio/label 查询主题和 Prompt；关于页至少断言产品标题、描述、disabled 更新占位，并确认页面没有额外 toolbar 区域。

## UI 验证范围

UI 变更测试应覆盖键盘可达、可见焦点、选中/禁用语义，以及异步区域的 `aria-busy` 和播报。静态检查、单元测试和视觉回归是不同证据：没有运行视觉回归时，不得把 RTL 或源码搜索表述为视觉已验证。

## 真实桌面 E2E

根目录 `e2e/` 使用 WebdriverIO 操作真实 Tauri 窗口。选择器继续遵守 RTL 的语义优先原则：role、accessible name、`aria-current`、`aria-busy`、`role=alert`；不要用 Tailwind class 或 DOM 层级。若导航与页面动作可见文案相同（例如都叫“翻译”），给动作补准确的 `aria-label`（当前为“执行翻译”），不要用模糊的 `button=翻译` 碰运气。

术语与收藏布局的真实桌面 E2E 至少断言：tooltip 的父节点是 `body`、computed position 为 `fixed` 且打开前后术语区高度不变；术语收藏按钮能从 `aria-pressed=false` 切到 true 并再次取消；超长连续文本所在行 `scrollWidth <= clientWidth`，默认存在三行 clamp，展开后目标行移除 clamp 且 `aria-expanded=true`。测试创建的收藏必须在用例结束前删除。

guest bridge 只允许在 `import.meta.env.MODE === "e2e"` 时动态加载。普通 `pnpm build` 必须保持无 WDIO bridge，完整 feature/capability/fixture 契约见 [后端真实桌面 E2E](../backend/e2e-testing.md)。

## 测试选择与证据

纯 lib/store/组件改动先由 `pnpm lint`、`pnpm test`、`pnpm build` 给反馈；涉及真实 IPC、配置持久化、窗口装配或关键结果操作时，再按 [全仓测试策略](../backend/testing-strategy.md) 追加生产隔离与桌面 E2E。Vitest 的 mocked Tauri 边界只能证明前端状态/渲染，不能表述为真实 Tauri 往返已执行。

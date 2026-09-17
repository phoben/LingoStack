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

当前覆盖包含常用纯逻辑、stores、主要 views，以及设置页中的 provider preset/discovery/model capability/generation 行为。ProviderForm 的 merge/filter/control 判定优先抽到 `lib/provider-catalog.ts` 做纯函数测试，SettingsView RTL 负责用户可见交互；仍不能用纯函数测试替代 loading/live region/保存失败等组件语义。IndexedDB 测试用 `fake-indexeddb`，并必须清理数据库与 store 状态以避免用例串扰。

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

提供商模型发现区域已使用稳定的 `aria-live` / `aria-busy` 与失败 `role="alert"`；设置保存等其他异步文本仍未全部统一。改到这些区域时按上表补齐，而非声称全站已覆盖。设置二级导航不是完整 ARIA tabs，没有方向键焦点漫游；`docs-view.tsx` 三个占位图标按钮仍可聚焦；没有自动化 axe/jest-axe 门禁。它们都是当前缺口，不是已完成能力。

## Scenario：设置配置加载失败不得伪装成永久加载

### 1. Scope / Trigger

- 配置 schema、`config-store.load()` 或依赖 `config === null` 的设置页分支发生变化时适用。

### 2. Signatures

```ts
type ConfigLoadState = {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
};
```

### 3. Contracts

- `config === null` 不能单独解释为“正在加载”；必须同时读取 `loading` 和 `error`。
- `loading=true && error=null` 显示 `aria-live="polite"` 的加载提示。
- `config=null && loading=false && error!=null` 显示 `role="alert"` 和后端实际错误，不得继续显示加载文案。
- schema 不兼容时不得在前端构造默认配置并静默覆盖旧文件；恢复操作必须是用户明确触发的独立流程。

### 4. Validation & Error Matrix

| 状态 | 可观察结果 |
|---|---|
| `config=null, loading=true, error=null` | “正在加载设置…” |
| `config=null, loading=false, error=message` | “配置加载失败：message”，`role=alert` |
| `config=null, loading=false, error=null` | “设置尚未初始化”，`role=alert`；不得伪装为 loading |
| `config!=null` | 渲染完整设置 UI；保存错误仍在业务区域或 Toast 可观察 |

### 5. Good/Base/Bad Cases

- Good：旧 schema 被 Rust 拒绝后，设置页立即显示“需重新配置”的真实原因。
- Base：首次加载期间短暂显示 loading，成功后原位进入设置 UI。
- Bad：写成 `if (!config) return loading`，会把所有磁盘/JSON/schema 错误伪装成永久等待。

### 6. Tests Required

- RTL 直接构造上述三态；失败态必须断言 `role=alert` 且 loading 文案不存在。
- Rust 配置测试继续断言旧 schema 返回可操作错误，不能改成静默默认值。
- 改动真实配置 IPC 后，用本机旧 schema fixture 或真实隔离配置验证 Tauri 窗口最终文本。

### 7. Wrong vs Correct

```tsx
// Wrong
if (!config) return <p>正在加载设置…</p>;

// Correct
if (!config) {
  if (error) return <p role="alert">{error}</p>;
  if (loading) return <p aria-live="polite">正在加载设置…</p>;
  return <p role="alert">设置尚未初始化</p>;
}
```

## Scenario：提供商模型输入与发现选择共享同一选中集合

### 1. Scope / Trigger

- 修改 `ProviderForm` 的模型手工输入、远端发现、选择、取消选择或保存逻辑时适用。

### 2. Signatures

```ts
const modelIds = useMemo(() => parseModelIds(modelsText), [modelsText]);
const selected = modelIds.includes(discoveredModel.id);
```

`modelIds` 是用户当前选择的事实来源；`draft.models` 保存已知 descriptor 与来源数据，但不得另设一份需要二次确认才能合并的 `selectedDiscovered`。

### 3. Contracts

- 模型输入框与“刷新模型”同排；发现候选只进入该输入框附属的多选 `listbox`，不再渲染第二套复选框结果区。
- 手工输入继续接受逗号、中文逗号、空白或换行分隔，并按模型 ID 去重。
- 点击候选或在组合框中按 Enter 必须在同一次交互中更新 `modelsText` 与对应 descriptor 缓存；保存不得依赖额外的“添加所选模型”动作。
- `option[aria-selected]` 始终从 `modelIds` 派生。保存后重新编辑、再次刷新时，已保存模型必须继续显示为已选。
- 刷新只提供候选，不自动加入全部远端模型；失败或空结果不得清空手工输入和既有草稿。
- 焦点保持在组合框输入：ArrowUp/Down 移动活动候选，Enter 切换，Escape、Tab 或点击外部关闭；option 不新增 Tab 停靠点。

### 4. Validation & Error Matrix

| 条件 | 可观察结果 |
|---|---|
| 首次刷新成功 | 下拉展开，已有模型 `aria-selected=true`，新候选为 false |
| 选择新候选 | 模型 ID 立即进入输入框和详情区；随后直接保存可持久化 |
| 取消已选候选 | 模型 ID 从输入框和待保存集合移除 |
| 再次刷新 | 已保存/当前草稿模型仍为已选，不重复追加 |
| 刷新失败或空结果 | 原输入不变；失败为 `role=alert`，空结果为 polite 状态 |

### 5. Good/Base/Bad Cases

- Good：选择候选后直接点“保存”，重新编辑并刷新仍显示已选。
- Base：用户只手工输入模型 ID，不执行发现也能保存。
- Bad：把勾选暂存在独立数组，只有再点“添加所选模型”才写入 `modelsText`；直接保存会静默丢失选择。

### 6. Tests Required

- RTL 必须覆盖点击与 Arrow/Enter 选择、取消、手工输入去重、Escape/Tab/外部点击关闭及 option 不进入 Tab 序列。
- 保存回归必须通过真实 `config-store.update()`：选择候选后直接保存，重新编辑、再次刷新并断言 `aria-selected=true`。
- 失败和空结果分别断言原输入未变化；测试只 mock Tauri IPC 边界，不 mock `ProviderForm` 或 store。
- UI 变更至少运行聚焦 RTL、全量 `pnpm test`、lint、build，并在真实 Tauri 窗口确认输入框、按钮和下拉布局。

### 7. Wrong vs Correct

```tsx
// Wrong：选择状态与保存状态分离
setSelectedDiscovered(ids);
const submitModels = parseModelIds(modelsText);

// Correct：选择动作立即更新保存所读的同一集合
setModelsText((current) =>
  selected
    ? parseModelIds(current).filter((id) => id !== model.id).join(", ")
    : mergeSelectedModelIds(current, [model.id]),
);
const submitModels = parseModelIds(modelsText);
```

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

`aria-busy=true` 是请求期间的瞬时状态，确定性 fixture 可能在 WebDriver 下一轮轮询前完成。桌面 E2E 验证最终结果时必须定位稳定的 `aria-live="polite"` 容器并断言完成文案，不得用 `[aria-busy]` 作为成功结果选择器；忙碌语义由组件测试覆盖，或由明确控制完成时机的 E2E fixture 单独验证。Toast 场景按用户可见类型/文案定位目标提示，不能用页面中第一个 `aria-live` 冒充 Toast。

术语与收藏布局的真实桌面 E2E 至少断言：tooltip 的父节点是 `body`、computed position 为 `fixed` 且打开前后术语区高度不变；术语收藏按钮能从 `aria-pressed=false` 切到 true 并再次取消；超长连续文本所在行 `scrollWidth <= clientWidth`，默认存在三行 clamp，展开后目标行移除 clamp 且 `aria-expanded=true`。测试创建的收藏必须在用例结束前删除。

guest bridge 只允许在 `import.meta.env.MODE === "e2e"` 时动态加载。普通 `pnpm build` 必须保持无 WDIO bridge，完整 feature/capability/fixture 契约见 [后端真实桌面 E2E](../backend/e2e-testing.md)。

## 测试选择与证据

纯 lib/store/组件改动先由 `pnpm lint`、`pnpm test`、`pnpm build` 给反馈；涉及真实 IPC、配置持久化、窗口装配或关键结果操作时，再按 [全仓测试策略](../backend/testing-strategy.md) 追加生产隔离与桌面 E2E。Vitest 的 mocked Tauri 边界只能证明前端状态/渲染，不能表述为真实 Tauri 往返已执行。

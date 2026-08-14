# 状态管理

Zustand，4 个 store。**无中间件**——没有 `persist`、没有 `devtools`、没有 `subscribeWithSelector`。

## 写法

`create<T>((set, get) => ({ ...state, ...actions }))`，动作与状态就地成对放（`ready` 紧跟 `setReady`）。只有需要读当前值或调用别的动作时才取 `get`。

`theme-store.ts` 是完整样例，同时展示了「动作调动作」、首屏缓存与 Rust 配置同步：

```ts
export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readStoredMode(),              // 只用于 Rust 配置加载前的防闪烁
  setMode: (mode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // 缓存失败不阻断本次主题切换
    }
    set({ mode });
    const config = useConfigStore.getState().config;
    if (config) {
      void saveConfig({ ...config, theme: mode });
      useConfigStore.setState({ config: { ...config, theme: mode } });
    }
  },
  cycleMode: () => {
    const idx = CYCLE_ORDER.indexOf(get().mode);
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    get().setMode(next);
  },
}));
```

Rust `AppConfig.theme` 是持久化事实来源，`localStorage` 仅是 `index.html` 首屏防闪烁缓存。应用加载配置后必须以 Rust 值覆盖缓存；用户从标题栏或设置页改主题时，同时更新缓存、配置 store 与 Rust 文件。保存失败保留本次视觉选择，并通过 config store 暴露错误。

## 界面语言

`src/lib/i18n.ts` 持有键集合完全一致的 `zh` / `en` 字典。组件用 `useT()` 订阅 `config-store` 中的 `ui_language`；`system` 由 `navigator.language` 解析，中文区域用中文，其余回退英文。不要在组件里自行分支语言，也不要把翻译语种 `Language` 当作 UI 语言类型。

所有 V1 可操作界面和状态文案都必须走字典；产品名、模型名、语言自称及尚未实现的 Docs 示例正文可保持原样。新增键时 TypeScript 必须保证两份字典同键。

## 消费一律用选择器

```ts
const activeView = useAppStore((s) => s.activeView);     // 对
const { activeView } = useAppStore();                    // 错，全站零例
```

现有调用点全部是选择器形式（`App.tsx:26-29`、`sidebar.tsx:11-12`、`translate-view.tsx:71-74`）。保持这个约定，避免整 store 订阅导致的无谓重渲染。

## store 就是服务层

没有独立 service 层。异步动作直接在 store 里调 IPC 或 IndexedDB：

- `config-store.ts` → `src/lib/ipc.ts`
- `favorites-store.ts` → `src/lib/favorites-db.ts`

新增异步能力照此办理，不要中间再加一层。

## 失败处理有两种策略，别混

这是最容易改错的地方——两个 store 刻意不同：

| store | 策略 | 依据 |
|-------|------|------|
| `config-store` | **不回滚**，只记 `error` | `config-store.ts:14-16` 注释写明是刻意的 |
| `favorites-store` | **乐观更新 + 失败回滚**，catch 里恢复 `prev` | `favorites-store.ts:46-52`、`:55-61` |

新增动作时先想清楚属于哪种：配置保存失败保留用户输入更友好；收藏增删失败必须回滚否则列表与库不一致。

`config-store.update()` 会先 `structuredClone` 再改（`:40`），避免污染调用方引用——有测试守护（`config-store.test.ts:54-72`）。改这个函数别把克隆去掉。

## 错误文本归一化：待收敛

`stringifyError` 在 `config-store.ts:50` 和 `favorites-store.ts:75` 各写一份（实现还不完全一样，后者多处理 `instanceof Error`），`translate-view.tsx:122` 和 `naming-view.tsx:75` 又内联了第三、四遍。

**下次碰到时抽到 `src/lib/` 共用**，不要抄第五遍。

## 调用异步动作的写法要统一

现状不一致：`translate-view.tsx` 用 `void translate()`，`naming-view.tsx:109` 直接 `onClick={generate}`，同文件 `:102` 又用 `void generate()`。

**新代码统一用 `void asyncFn()`** ——明确表示刻意不等待，也避免 eslint 对返回 Promise 的事件处理器报警。

`settings-ai.tsx:65-110` 的几个 handler 既不 `await` 也不 `void`，失败反馈全靠页面别处渲染 store 的 `error`（`:226-228`），与触发动作脱节。改这个文件时顺手补上就近反馈。

## IndexedDB 分三层

手写原生 API，**不引 `idb` / `dexie`**（理由见 `favorites-db.ts:1-6`：为一个对象仓库不值得加依赖）。

| 层 | 文件 | 职责 |
|----|------|------|
| 纯逻辑 | `lib/favorites.ts` | `Favorite` 类型、`inferKind`、`newFavorite`（`createdAt`/`id` 可注入以便测试）、`filterFavorites`、`sortByNewest`、`parseImport`、`toExportJson` |
| 纯 IO | `lib/favorites-db.ts` | 开库、事务、增删查 |
| 粘合 | `stores/favorites-store.ts` | 调上面两层，持有 `list`/`loading`/`error` |

DB 层要点：`DB_NAME = "lingostack"`、`DB_VERSION = 1`、`STORE = "favorites"`，`keyPath: "id"` 加 `createdAt` 索引（`:20-22`）。通用事务封装 `withStore<T>(mode, run)`（`:30-52`）负责开库、起事务、`oncomplete` 解析、`onerror`/`onabort` 拒绝、`finally` 关连接。

单条操作走 `withStore`；批量导入 `putFavorites`（`:66-81`）自己起事务，因为要在**一个事务里**循环 `put`。

**改 schema 必须升 `DB_VERSION` 并在 `onupgradeneeded` 里写迁移**——目前只有 v1，没有任何迁移代码可参照，是首次要面对的问题。

新增业务规则优先放 `favorites.ts`（纯函数、可测），别塞进 DB 层或 store。`favorites-db.ts` 与 `favorites-store.ts` **当前零测试**（jsdom 无 IndexedDB 实现），所以纯逻辑下沉得越多，覆盖率越真实。

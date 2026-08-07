# lingostack-app 前端开发规范

> React 18 + TypeScript 严格模式 + Vite + Tailwind + Zustand。工程根在仓库根（`package.json` 在根），源码在 `src/`。

同包的 Rust 侧规范见 [backend](../backend/index.md)。

## 开发前检查清单

- [ ] **设计先行**：设计任何组件、页面、样式之前，先调用 `/lingostack-design` 技能熟悉既有设计规范与原型稿，优先按原型实现
- [ ] 要调后端？→ 走 `src/lib/ipc.ts`，不直接 `invoke`。涉及新字段先读 [IPC 契约指南](../../guides/ipc-contract-guide.md)
- [ ] 要加状态？→ 读 [状态管理](./state-management.md)，注意两个 store 的失败处理策略是相反的
- [ ] 要加组件？→ 读 [组件与样式](./components-and-styling.md)。`ui/` 原语是手写的，**不是 shadcn 生成物**
- [ ] 异步状态区域？→ 加 `aria-live`，这是全站现存缺口

## 具体规范

| 文档 | 内容 |
|------|------|
| [状态管理](./state-management.md) | Zustand 写法、选择器约定、失败处理的两种策略、IndexedDB 分层 |
| [组件与样式](./components-and-styling.md) | 手写原语的变体模式、Tailwind 令牌、视图路由、主题应用 |
| [测试与可访问性](./testing-and-a11y.md) | Vitest + RTL 模式、mock 边界、覆盖缺口、a11y 既有约定与缺口 |

## 质量门禁

```bash
pnpm lint      # eslint --max-warnings 0，warn 级也会失败
pnpm build     # tsc --noEmit + vite build
pnpm test      # vitest run
```

TypeScript 严格模式，额外开了 `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch` / `noUncheckedSideEffectImports`（`tsconfig.json:17-21`）。

`@typescript-eslint/no-explicit-any` 由 `tseslint.configs.recommended` 置为 error。**当前 `src/` 下 `any` 出现次数为 0**——保持这个数字。

全站唯一的 eslint-disable 在 `translate-view.tsx:133`，且上一行写明了理由。新增 disable 必须同样附理由。

## 目录约定

```
src/
  App.tsx / main.tsx        视图路由 + 应用入口
  components/               title-bar / sidebar / status-bar / view-shell
    views/                  六视图：translate / naming / docs / favorites / settings / about
    ui/                     手写原语：button / input / textarea / select / pill
    provider-form / settings-ai
  lib/                      config-types（Rust 类型 TS 镜像）/ ipc / naming
                            favorites(+db) / view-meta / utils
  stores/                   zustand：app / theme / config / favorites
  hooks/                    use-theme
```

测试文件与被测文件**同目录并列**（`foo.ts` + `foo.test.ts`），无 `__tests__/`。

## 已知的结构问题

`settings-view.tsx` 与 `settings-ai.tsx` **互相 import**：前者引 `SettingsAi`（`settings-view.tsx:5`），后者从视图文件反向引 `SetSection` / `FuncCell`（`settings-ai.tsx:7`）。当前未形成真实 ESM 循环，但很脆弱。

再动这两个文件时，把 `SetSection` / `FuncCell` 提到 `components/` 下的共享位置，别继续从视图文件里往外导出可复用组件。

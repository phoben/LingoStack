# lingostack-app 前端开发规范

> React 18 + TypeScript 严格模式 + Vite + Tailwind + Zustand。工程根在仓库根，产品源码在 `src/`。

同包 Rust 侧规则见 [backend](../backend/index.md)。

## 开发前检查清单

- [ ] **涉及界面、页面或样式**：先读 [UI 设计主契约](./ui-design.md)。先核对当前生产源码，再读已落地规范与决策；`.claude/skills/lingostack-design/` 仅补充仍与源码一致的意图。宿主提供该技能时可以使用，但不是唯一前置条件。
- [ ] 要调后端？→ 走 `src/lib/ipc.ts`，不直接 `invoke`；新字段先读 [IPC 契约指南](../../guides/ipc-contract-guide.md)。
- [ ] 要加状态？→ 读 [状态管理](./state-management.md)，两个 store 的失败处理策略相反。
- [ ] 要加组件？→ 读 [组件与样式](./components-and-styling.md)；`ui/` 原语是手写的，不是 shadcn 生成物。
- [ ] 要新增或修改异步状态区域？→ 读 [测试与可访问性](./testing-and-a11y.md)。翻译、命名、收藏已有 live region；设置页的保存、校验与热键注册状态也必须就地可观察。

## 具体规范

| 文档                                      | 内容                                                   |
| ----------------------------------------- | ------------------------------------------------------ |
| [UI 设计主契约](./ui-design.md)           | 当前窗口骨架、视觉令牌、布局、状态、桌面适配和 UI 验收 |
| [组件与样式](./components-and-styling.md) | 手写原语实现、组合边界、视图路由和主题接线             |
| [状态管理](./state-management.md)         | Zustand 写法、选择器约定、失败处理和 IndexedDB 分层    |
| [测试与可访问性](./testing-and-a11y.md)   | Vitest + RTL、mock 边界、已有 a11y 语义与缺口          |

## 质量门禁

```bash
pnpm lint      # eslint --max-warnings 0，warn 级也会失败
pnpm build     # tsc --noEmit + vite build
pnpm test      # vitest run
```

TypeScript 严格模式，额外开了 `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch` / `noUncheckedSideEffectImports`（`tsconfig.json:17-21`）。

`@typescript-eslint/no-explicit-any` 由 `tseslint.configs.recommended` 置为 error。当前 `src/` 下 `any` 出现次数为 0，保持这个数字。

全站唯一的 eslint-disable 在 `translate-view.tsx:133`，且上一行写明理由；新增 disable 同样必须附理由。

## 目录约定

```
src/
  App.tsx / main.tsx        视图路由 + 应用入口
  components/               title-bar / sidebar / view-shell / provider-form / settings-ai
    views/                  translate / naming / docs / favorites / settings / about
    ui/                     手写原语：button / input / textarea / select / pill
  lib/                      config-types / ipc / naming / favorites(+db) / view-meta / utils
  stores/                   app / theme / config / favorites
  hooks/                    use-theme
```

测试与被测文件同目录并列（`foo.ts` + `foo.test.ts`），不用 `__tests__/`。

## 已知结构问题

`settings-view.tsx` 与 `settings-ai.tsx` 互相 import。再动这两个文件时，将 `SetSection` / `FuncCell` 提到 `components/` 下的共享位置，不要继续从视图文件往外导出可复用组件。

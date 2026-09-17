# Issue 23 实施计划

## 执行清单

- [x] 1. 提取设置页共享分节组件，消除 `settings-view` / `settings-ai` 循环依赖，并保持现有界面与测试行为。
- [x] 2. 新增 AI 配置可执行性纯逻辑及单测，覆盖功能默认、全局兜底、缺失分配、孤儿提供商和空模型名。
- [x] 3. 扩展 `app-store` 的设置子页深链，新增共享“设置 AI”动作组件及中英文文案，并测试普通设置入口与 AI 直达入口。
- [x] 4. 为 `stream-store` 增加配置错误分类，在翻译、命名失败区按配置错误/请求错误显示“设置 AI”或“重试”。
- [x] 5. 在收藏词条解释和文档翻译的失败/重试入口接入同一配置判定，保证配置恢复后重新出现“重试”。
- [x] 6. 用当前语言导航尺寸探针替换侧栏固定阈值，统一拖拽双向边界和双击行为；补纯逻辑与组件测试。
- [x] 7. 为 API Key 增加局部显隐按钮，补默认掩码、切换、保存/取消/重开复位及无障碍测试。
- [x] 8. 运行受影响的 Vitest 测试，修复回归后运行 `pnpm lint`、`pnpm test`、`pnpm build`。
- [x] 9. 使用 `trellis-check` 做全范围规范与数据流复核；如实现产生可复用新约定，再评估 `trellis-update-spec`。

## 重点文件

- `src/lib/ai-configuration.ts`（新增）及测试
- `src/stores/app-store.ts`、`src/stores/stream-store.ts` 及测试
- `src/components/ai-configuration-action.tsx`（新增）
- `src/components/settings-section.tsx`（新增）
- `src/components/views/{translate,naming,docs,favorites,settings}-view.tsx`
- `src/components/{sidebar,provider-form,settings-ai}.tsx`
- `src/lib/sidebar-layout.ts`、`src/lib/i18n.ts`
- 对应组件与纯逻辑测试

## 验证命令

```bash
pnpm vitest run src/lib/ai-configuration.test.ts src/stores/app-store.test.ts src/stores/stream-store.test.ts src/lib/sidebar-layout.test.ts src/components/sidebar.test.tsx src/components/views/translate-view.test.tsx src/components/views/naming-view.test.tsx src/components/views/docs-view.test.tsx src/components/views/favorites-view.test.tsx src/components/views/settings-view.test.tsx
pnpm lint
pnpm test
pnpm build
```

## 风险点与回滚点

- 设置导航与 AI 错误引导是一条跨视图链路；若失败，先回滚共享深链组件，不改模型配置数据。
- 侧栏测量依赖 DOM/字体时序；若 ResizeObserver 或字体事件不稳定，保留默认宽度作为安全回退并单独回滚测量逻辑。
- API Key 显隐只允许组件局部状态；评审时检查没有新增 localStorage、store 或配置字段。
- 不执行数据库迁移、配置迁移、依赖升级、Git 提交或推送。

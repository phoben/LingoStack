# Research: current-app-testability

- Query: Map the current LingoStack test/build/CI infrastructure, desktop startup and IPC boundaries, deterministic mock seams, and stable E2E scenarios/selectors for a Tauri 2 WebDriver test foundation.
- Scope: internal
- Date: 2026-08-14

## Findings

### Current automation baseline

- `package.json:5-15` has Vite/Vitest scripts only (`lint`, `build`, `test`, `tauri`); there is no E2E script, WebdriverIO package, report writer, or test-only build command.
- `package.json:17-47` and `pnpm-lock.yaml` contain no `webdriverio`, `@wdio/*`, or Tauri WDIO service dependency. The only package-level test runner is Vitest.
- `vite.config.ts:32-37` configures Vitest for jsdom. Existing frontend tests are adjacent to source (`src/**/*.test.ts[x]`), including stores, utilities, `Sidebar`, and `TitleBar`; there are no view tests for translation/settings/favorites. This matches `.trellis/spec/lingostack-app/frontend/testing-and-a11y.md`.
- `Cargo.toml:3-11` has seven workspace members. `src-tauri/Cargo.toml:33-61` has no WDIO plugin dependencies; its only features are `default = ["custom-protocol"]` and `custom-protocol`. There is no existing test-only feature gate.
- `Cargo.toml:21-49` centrally owns dependencies. `wiremock = "0.6"` is available as a workspace dev dependency and is used by the LLM crate's tests, but it is not an application/E2E fixture or runtime mock seam.
- `.github/workflows/ci.yml:14-72` runs Rust fmt, clippy, workspace tests/build, and a three-OS core-purity check after `pnpm build`. `.github/workflows/ci.yml:74-105` runs frontend lint, Vitest, and build on Ubuntu. There is no E2E job, test artifact upload, screenshot/report retention, or CI log collection beyond native job logs.
- The worktree status at inspection had only untracked Trellis task/workspace paths; no product changes were introduced by this research.

### Application startup, build, and capability boundary

- `src-tauri/tauri.conf.json:5-10` starts Vite with `pnpm dev` at `http://localhost:1420` for dev and builds frontend `dist` with `pnpm build`. The same config has one main desktop window, label `main`, at `:13-30`.
- `src-tauri/src/main.rs:4-6` calls `lingostack_app_lib::run()`. `src-tauri/src/lib.rs:20-57` creates the Tauri builder, adds single-instance and global-shortcut plugins, registers state/commands, creates the tray, loads config, registers hotkeys, then runs the app.
- `src-tauri/capabilities/default.json:2-16` scopes permissions to `main`; it permits core/window/event APIs only. Per `.trellis/spec/lingostack-app/backend/ipc-commands.md`, custom commands do not need capability entries, while a test plugin's capability needs an explicit, isolated test configuration.
- `src-tauri/src/lib.rs:35-37` stores only `config_path` in `AppState`. The fixed location comes from `config::config_path()` (`src-tauri/src/config.rs:21-28`); it uses the OS user config directory. Tests cannot currently point the app at an isolated fixture configuration without adding a deliberate test seam.
- `src-tauri/src/lib.rs:52` independently calls `config::config_path()` during setup, rather than using managed state. Any test-config path override must cover both the managed state and setup/hotkey load path, otherwise the test can leak to or depend on the developer's real config.

### IPC, translation, and LLM path

- The registered command set is `load_config`, `save_config`, `effective_prompt`, `chat_stream`, `get_selection`, `speak`, and `stop_speaking` in `src-tauri/src/lib.rs:39-47`.
- TypeScript uses one typed IPC facade in `src/lib/ipc.ts:19-63`. Its `chatStream()` creates a Tauri `Channel`, forwards `onmessage`, then invokes `chat_stream` (`:55-63`). E2E should exercise this real boundary rather than mock it in WebDriver tests.
- `src-tauri/src/commands.rs:76-103` loads configuration, resolves the feature model, constructs a provider, streams chunks as `ChatEvent::Chunk`, sends `Done` on normal completion, and emits `Error` plus returns `Err` on provider failure. The UI therefore has two observable deterministic branches: streamed completion and a user-visible error/retry state.
- Provider selection is hard-wired by `build_provider` in `src-tauri/src/commands.rs:109-131`; OpenAI-compatible/Ollama reuse `OpenAiProvider`, Anthropic and Gemini have dedicated providers. There is no trait injection or test provider chosen from `AppState`.
- `src/components/views/translate-view.tsx:161-172` fetches `effective_prompt("translate")`, replaces language placeholders, and asks `stream-store` to send the resulting two messages. `src/stores/stream-store.ts:92-138` owns streaming, accumulated output, status, and error. It is already unit-tested with mocked `chatStream` (`src/stores/stream-store.test.ts`), but that mock is not available in the real desktop application.
- A deterministic E2E implementation can use an isolated config fixture whose provider is `open_ai_compatible` and `base_url` points to a test-owned local HTTP fixture. That exercises the existing real provider/IPC/Channel path without API keys or external network. It still requires a safe app-level config-path seam and a lifecycle-owned fixture process. Do not use a real provider or an arbitrary localhost service.
- A deterministic error can be a fixture response that follows the existing OpenAI-compatible streaming protocol but fails mid-stream/non-2xx in the intended provider-tested shape. The desired assertion is the existing translation error state (`role="alert"`) and retry control, not a fabricated provider-error UI.

### Frontend routes and stable interaction surfaces

- There is no router. `src/App.tsx:26-69` conditionally renders six views based on `useAppStore.activeView`: translate, naming, docs, favorites, settings, about. `src/lib/view-meta.ts:31-38` is the ordered, single-source navigation list and `src/components/sidebar.tsx:79-120` renders native buttons whose accessible names are the current Chinese labels.
- Stable navigation selectors are role/name based: `getByRole("navigation", { name: "主导航" })` and buttons `翻译`, `命名`, `文档`, `收藏`, `设置`, `关于`; active selection is exposed through `aria-current="page"` (`sidebar.tsx:80, 91-96`). There are no `data-testid` attributes in `src/`.
- Translation is the strongest first E2E target. `translate-view.tsx:200-234` exposes labelled source/target native selects (`源语言`, `目标语言`) and a button named `翻译`/`翻译中…`. The source text area has placeholder `输入或粘贴要翻译的文本` (`:253-258`). The result container has `aria-live="polite"` and `aria-busy`; failure uses `role="alert"` and a `重试` button (`:274-288`). These are stable semantics, although adding explicit labels to the source textarea would make selector usage stronger.
- Settings is a viable real persistence E2E boundary: navigate using `设置`, choose the AI group button (current state exposed by `aria-current="page"`, `settings-view.tsx:97-117`), click `添加提供商` (`settings-ai.tsx:180-189`), fill the form fields by currently visible labels (`名称`, `协议`, `Base URL`, `API Key`, `模型（逗号或换行分隔）`, `provider-form.tsx:65-116`), and press `添加`/`保存` (`:119-125`). The provider row exposes accessible edit/delete controls (`settings-ai.tsx:150-165`). This flow calls the actual `save_config` IPC through `config-store.ts:34-47`.
- The useful settings assertion is that the provider row and feature-model selection persist after an app restart into the same isolated test configuration. It must never write to a real user's config directory. Error feedback currently has no `role=alert` or live region (`settings-ai.tsx:227-229`), so a settings-save-failure E2E should not be claimed as accessible/fully observable until that UI contract is improved.
- Favorites can be reached and has good semantic controls (`搜索收藏`, `导入 JSON`, `导出 JSON`, `aria-pressed` filters, and `role=alert`; `favorites-view.tsx:91-154`), but it relies on IndexedDB and import uses a native file picker. It is optional for the first gate and needs driver-specific file-upload support plus per-run WebView data isolation before claiming deterministic coverage.

### System-boundary exclusions

- Global hotkeys are registered during `src-tauri/src/lib.rs:51-53` and use OS integration; the frontend only listens for `translate-selection` in `src/App.tsx:37-52`. WebDriver can verify the app-side reaction if it can emit an application event, but cannot prove cross-application keystrokes/selection behavior.
- `get_selection`, `speak`, and `stop_speaking` directly call platform providers (`src-tauri/src/commands.rs:15-34`). The relevant Windows implementations are environment-dependent by design; `.trellis/spec/guides/platform-isolation-guide.md` limits automated assertions to non-panicking/self-consistent behavior. Real external-app selection and audible speaker output need a Windows native/manual acceptance procedure, not a WebDriver-only pass.
- `docs-view.tsx` is labelled P1 in `src/lib/view-meta.ts:53-57`; settings also contains explicit V1 placeholder controls (`src/components/views/settings-view.tsx:122-186`). Do not write E2E cases that assert those controls have functional persistence or document translation behavior.

### Smallest credible deterministic desktop E2E set

1. **Startup/navigation smoke:** start the real Tauri executable with test-only WDIO support, wait for `主导航`, visit `设置` and return to `翻译`, asserting the selected view's real controls. This proves startup, WebView availability, and in-app route interaction.
2. **Translation success through real IPC:** install the isolated fixture config/provider, enter a known source string, invoke `翻译`, wait for `aria-busy` to clear and the exact fixture-generated output. This covers `effective_prompt` → model resolve → HTTP fixture → Rust stream → Tauri Channel → Zustand/UI.
3. **Translation failure/retry UI:** switch the fixture to its deterministic failure mode (or use a dedicated test case/config), submit known text, wait for the current alert and `重试` button, then configure its next fixture response as success and assert recovered output. This covers the existing UI error/retry contract, not an invented cancellation feature.
4. **Settings provider persistence:** add one deterministic local provider and assign its model to `翻译`, verify the visible provider/model selection, relaunch the app, and verify it reloads. This is the existing `save_config`/`load_config` path and establishes test configuration isolation.

## Related Specs

- `.trellis/spec/lingostack-app/backend/index.md` — current IPC and Tauri test gaps.
- `.trellis/spec/lingostack-app/backend/ipc-commands.md` — command/channel and ACL contract.
- `.trellis/spec/lingostack-app/backend/app-setup.md` — startup and platform integration order.
- `.trellis/spec/lingostack-app/frontend/testing-and-a11y.md` — mock boundary and semantic-selector conventions.
- `.trellis/spec/lingostack-app/frontend/state-management.md` — config persistence and stream-store behavior.
- `.trellis/spec/guides/ipc-contract-guide.md` — Rust/TS configuration and stream event contract.
- `.trellis/spec/guides/platform-isolation-guide.md` — limits of system-level automated verification.

## Caveats / Not Found

- No current desktop E2E harness, WDIO configuration, Tauri WDIO plugin, test-only Tauri capability, E2E fixture server, config-path override, or selector attributes was found.
- `docs/lingostack-design.md` mentions historical/planned `tauri-driver + WebDriver` and a floating selection UI, but source currently uses the main window and has no driver implementation. Treat that document as aspirational/stale where it conflicts with current source.
- This report is repository-only. Official WDIO/Tauri 2 embedded-provider compatibility, platform CI support, and exact dependency versions require separate external documentation research plus actual Windows execution evidence.

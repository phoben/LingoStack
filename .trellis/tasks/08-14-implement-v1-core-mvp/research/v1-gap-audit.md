# Research: V1 core MVP gap audit

- Query: Compare the repository with `docs/lingostack-design.md` V1 core MVP, using the confirmed scope: Windows-only runtime acceptance; macOS/Linux selection/TTS compile with typed `Unsupported`; selection translation stays in the main window; no PopClip toolbar or translation popup; five naming styles and five candidates; favorites are flat; release/signing and non-explicit backlog are out of scope.
- Scope: internal
- Date: 2026-08-14

## Files found

- `docs/lingostack-design.md` — product baseline; its newer V1 decisions supersede the stale "PopClip/popup" wording in the broad V1 list.
- `src-tauri/src/{lib.rs,commands.rs,hotkeys.rs}` — Tauri composition, IPC and hotkey runtime.
- `crates/lingostack-{core,llm,selection,hook,tts}/src/` — domain logic, providers and native adapters.
- `src/{App.tsx,lib,stores,components}` — main-window flows, persistent settings and favorites UI.
- `.github/workflows/{ci,dco,audit}.yml`, `.github/{ISSUE_TEMPLATE,PULL_REQUEST_TEMPLATE.md}` — existing governance/CI baseline.

## Findings

### What is already materially implemented

- Windows selection is UIA-first with clipboard fallback (`crates/lingostack-selection/src/windows.rs:39-60`); Windows TTS preserves a single asynchronous SAPI voice thread and supports interruption (`crates/lingostack-tts/src/windows.rs:169-181`). macOS/Linux selection/TTS factories use platform modules, and TTS placeholders return `Unsupported` (`crates/lingostack-tts/src/lib.rs:35-60`, `macos.rs:27-34`, `linux.rs:26-33`). This matches the confirmed platform boundary; do not broaden it to native macOS/Linux work.
- The main-window selection flow already exists: the hotkey effect shows/focuses `main` and emits `translate-selection` (`src-tauri/src/hotkeys.rs:121-130`); `App` receives it, switches to translate, fetches text, and injects it (`src/App.tsx:38-47`); `TranslateView` consumes the injection and automatically starts streaming (`src/components/views/translate-view.tsx:175-183`). No second window is created.
- Translation and naming stream through the single IPC command (`src-tauri/src/commands.rs:74-104`) and preserve partial output/retry UI (`translate-view.tsx:274-288`, `src/stores/stream-store.ts:119-138`). Naming intentionally performs one model request then converts each neutral phrase locally into all five styles (`src/lib/case-convert.ts:37-55`, `src/components/views/naming-view.tsx:16-18`).
- Provider CRUD and per-feature/global model selection are connected to persisted config (`src/components/settings-ai.tsx:44-109`, `:192-224`); config resolution already implements feature -> global fallback (`crates/lingostack-core/src/config.rs:231-245`). Favorites use frontend IndexedDB and are a flat searchable/importable/exportable list (`src/lib/favorites-db.ts:10-26`, `src/components/views/favorites-view.tsx:27-70`).
- Existing open-source foundations cover MIT, CONTRIBUTING, Code of Conduct, security policy, Issue/PR templates, DCO, Dependabot, and audit CI (`LICENSE:1`, `.github/workflows/dco.yml:1-52`, `.github/workflows/audit.yml:25-66`). They should be verified, not rebuilt.

### P0 gaps — required before the V1 Windows user flow can be accepted

1. **Superseded: standalone explanation flow.** This former finding is no longer a requirement. Translation and contextual explanation now share exactly one LLM request: the translation result carries up to five lightweight contextual IT-term tags, rather than exposing a second Explain command/view/request. `Feature::Explain` may remain for backwards-compatible persisted configuration only if its product path is explicitly retired; it must not lead to a separate V1 interaction.

2. **Language mapping/detection rules exist only as dead core logic.** `Language::detect` and `resolve_target_language` implement all four rules (`crates/lingostack-core/src/lang.rs:52-103`), but translation initializes literal `auto`/`zh` state and only substitutes UI labels in the prompt (`src/components/views/translate-view.tsx:153-171`). The configuration `pair_mappings`, `ui_language`, and `global_default_target` are never consulted by that screen. Settings instead renders hard-coded rows and disabled-by-absence interactions marked `V1 实装` (`src/components/views/settings-view.tsx:124-160`). Add one IPC-safe resolution boundary (or mirror the pure rules with contract tests), bind the translation defaults to saved configuration, and implement mapping CRUD + UI language selection.

3. **The settings hotkey experience is a prototype, so users cannot repair conflicts.** Runtime registration correctly produces `hotkey-status` (`src-tauri/src/hotkeys.rs:60-108`), but frontend contains no listener (repository search finds only the emitter) and renders static macOS-looking keys plus a fabricated conflict (`src/components/views/settings-view.tsx:18-37`, `:190-225`). No capture/edit/save/re-register path exists. V1 needs display of actual statuses, editable bindings with validation, save, re-registration and a visible recoverable conflict result.

4. **V2 popup terminology remains in the V1 configuration model and hotkey route.** `TranslatePopup` is still a `HotkeyAction` (`crates/lingostack-core/src/hotkey.rs:57-67`), receives default `Ctrl+Shift+T` (`:83-104`), and is treated as the same selection action in runtime (`src-tauri/src/hotkeys.rs:121-130`). The new V1 design says the selection hotkey should be `Ctrl+Shift+D` and the main window is the sole presentation (`docs/lingostack-design.md:84-94`, `:141-147`). Remove/re-purpose the popup action end-to-end (model/defaults/runtime/settings/tests); do not implement a popup.

### P1 functional gaps — needed to meet stated V1 behaviour rather than merely expose primitives

5. **Selection fallback is invisible to the user.** The IPC result includes `source` (`src-tauri/src/commands.rs:12-20`, `src/lib/ipc.ts:11-17`), but `App` discards it (`src/App.tsx:41-44`). The design requires a permission/fallback explanation. Show a non-blocking clipboard-fallback message in the translation view; for an error, present the returned guidance and retain manual paste.

6. **Tray navigation does not fulfill the menu actions.** Tray currently offers main/settings/quit (`crates/lingostack-hook/src/tray.rs:46-62`), yet settings just shows main and explicitly says it needs later frontend navigation (`:89-96`). The design requires direct main, selection translation, favorites, settings and exit actions. Add the V1 menu actions and narrow frontend events to set the relevant main-window tab; no extra window needed.

7. **TTS can start but cannot be stopped from the UI.** `stop_speaking` IPC and TypeScript wrapper exist (`src-tauri/src/commands.rs:30-34`, `src/lib/ipc.ts:29-32`), but there is no frontend call site. Provide an accessible stop/toggle control and errors/unsupported feedback. Preserve the existing Windows speaker threading design.

8. **Theme is not persisted through the app configuration.** Theme controls use standalone localStorage (`src/stores/theme-store.ts:7-50`) even though `AppConfig` persists `theme` and config is loaded at startup (`crates/lingostack-core/src/config.rs:173-220`, `src/stores/config-store.ts:25-47`). Decide the intended V1 single source (the design says Rust JSON config) and connect UI changes/loading through it, retaining the existing anti-flash cache only if it is synchronized.

9. **LLM failure requirements are incomplete.** `LlmError::is_retryable()` / `is_rate_limited()` are defined and tested but repository search shows no production caller (`crates/lingostack-llm/src/lib.rs:119-170`). `chat_stream` forwards the first error directly (`src-tauri/src/commands.rs:86-103`). Implement exactly one exponential-backoff retry for timeout/5xx/network cases and an explicit 429 wait/concurrency response; do not claim this is already present.

10. **"Five candidates" needs a hard output boundary.** The Prompt asks for five candidates (`crates/lingostack-core/src/prompt.rs:103-133`), but the frontend displays whatever parsed rows arrive (`src/components/views/naming-view.tsx:87-125` via `buildNamingGrid`). Add parser/UX behaviour for malformed, fewer, or more than five model lines, and test exactly five aligned rows across all five styles.

### One-request translation + contextual-term contract (new confirmed requirement)

`chat_stream` is provider-neutral at the application boundary: every provider becomes a sequence of `ChatEvent::Chunk { delta }` strings (`src-tauri/src/commands.rs:62-104`), and the existing translation UI appends those strings as plain text (`src/stores/stream-store.ts:119-128`). V1 therefore needs an application-owned textual envelope, rather than provider-specific JSON mode, function calling, or a second LLM call.

**Recommended response contract.** Require the model to emit normal translation text first, followed only at completion by a reserved sentinel line (for example `<<<LINGOSTACK_TERMS_V1>>>`) and compact JSON:

```text
<translation in target language>
<<<LINGOSTACK_TERMS_V1>>>
[{"term":"source-language term","explanation":"concise source-language IT-context explanation"}]
```

- The JSON array is optional but, when present, must contain 0–5 objects. `term` is only a contextual professional IT term: a technology concept, programming/stack term, or product name; ordinary vocabulary is excluded. Both fields must be non-empty strings, terms should be de-duplicated, and explanations remain concise in the resolved/detected source language.
- The frontend stream parser must show text before the sentinel as the translation while buffering the potential metadata suffix. Once the sentinel begins, do not expose its fragments in the translation pane; on `done`, parse/validate the whole suffix and publish at most five tags. This preserves meaningful translation streaming even though tags are normally available only at the end.
- A malformed/missing sentinel, invalid JSON, invalid item, excess entries, or stream error must never make the translation unavailable. Preserve the already-rendered translation; discard untrusted term metadata (or retain only independently validated first five objects), record a non-disruptive diagnostic, and offer existing translation retry. Never render raw JSON/sentinel as translated prose.
- Tags are presentation metadata, not a separate result page: render them below the translation as small buttons. Hover and keyboard focus reveal the concise explanation (with appropriate `aria-describedby`/tooltip semantics); Escape/blur closes the disclosure. Do not create a toolbar, popup, or separate explanation request.

**Custom-Prompt interaction.** `effective_prompt` currently returns a user override verbatim (`src-tauri/src/commands.rs:48-59`; `crates/lingostack-core/src/prompt.rs:41-58`). The implementation must compose the selected translation prompt with a non-optional protocol suffix that specifies the sentinel/schema/term-selection rules. A custom prompt may change translation style, but cannot replace or contradict response formatting; its visible prompt editor/help must say this. Keep existing `{source_lang}` / `{target_lang}` substitution intact (`src/components/views/translate-view.tsx:161-171`) and include the resolved source language in the mandatory term-language rule. Test both built-in and custom translation prompts, including a custom instruction that attempts a conflicting output format.

### Test and acceptance gaps

- No Tauri-driver/WebDriver dependency, E2E script, or desktop E2E files exist (`package.json:7-16`; repository test inventory is Vitest unit tests only). Add Windows-only runtime acceptance covering: selection-hotkey -> main translate -> stream -> copy/favorite/speak/stop; text translation with term-tag focus disclosure; naming five-by-five; editable hotkey conflict recovery; and persisted settings/mappings/theme.
- Add a pure incremental envelope-parser test matrix: translation-only; one chunk containing the sentinel; sentinel/JSON split across arbitrary chunks; 0/1/5/6 terms; duplicate/ordinary-word filtering; invalid JSON; sentinel without JSON; invalid item shapes; stream error before/after the sentinel; and translation text that resembles but does not equal the sentinel. Add component tests that tags are absent on parser failure, never leak protocol text, and are reachable by keyboard focus as well as hover.
- Add provider adapter/integration fixtures that split the same envelope differently for OpenAI-compatible, Anthropic and Gemini SSE parsing. This verifies the contract is applied after provider normalization, not by assuming one provider's chunk boundaries or structured-output feature.
- Component/store coverage exists for stream, theme, config and naming utilities, but Favorites DB/store/view and all settings views have no tests (test inventory under `src/` contains no favorites/settings tests). Add fake-indexedDB/unit coverage for rollback/import, and Testing Library tests that consume actual hotkey-status events and saved config.
- Current Rust tests prove construction or environment-safe non-panics for native APIs, not successful Windows UIA/SAPI output (`crates/lingostack-selection/src/windows.rs:129-161`; `crates/lingostack-tts/src/windows.rs:196-285`). Retain these as CI tests and separately record manual Windows evidence.
- No cross-IPC contract test compares Rust default config, command payloads, and `src/lib/config-types.ts`; this matters when adding language and hotkey config. The existing hand-written-mirror risk is documented in `.trellis/spec/guides/ipc-contract-guide.md:3-22`.
- The required `THIRD_PARTY_NOTICES` generator/output is not present in the repository search; create it only because it is in the explicit V1 open-source list. Release action, signing and other §14 backlog items remain out of scope.

### Recommended dependency order

1. Align V1 terminology/data contracts first: remove popup action, choose config/theme ownership, define the one-request translation/term envelope and selection-feedback UI contracts, and update TypeScript mirrors with contract tests.
2. Wire functional settings (language mappings/UI language, hotkeys/status/re-registration, tray events), then consume these settings in selection translation.
3. Implement translation term tags/focus disclosure and stop-capable TTS UI; retain typed Unsupported on macOS/Linux.
4. Complete LLM reliability and naming-five boundary behaviour.
5. Add favorites/settings/IPC tests, Windows desktop acceptance coverage, manual native evidence, and the `THIRD_PARTY_NOTICES` generator; run existing CI checks across platforms.

## Related specs

- `.trellis/spec/guides/ipc-contract-guide.md` — Rust/TS mirrors and Channel/event distinctions.
- `.trellis/spec/guides/platform-isolation-guide.md` — keep platform `Unsupported` paths typed and testable; no caller-side `cfg` branches.
- `.trellis/spec/lingostack-selection/backend/index.md` and `.trellis/spec/lingostack-tts/backend/index.md` — Windows native constraints and test limits.
- `.trellis/spec/lingostack-hook/backend/index.md` — hotkey responsibilities divided among core, hook, and app.

## Caveats / Not Found

- `docs/lingostack-design.md:284-292` still says PopClip/popup in its broad V1 bullet. The newer explicit decisions at `:84-94` and `:141-147`, plus the confirmed user scope, govern this plan; do not treat the stale bullet as an implementation requirement.
- This was a static/source audit. No builds, tests, target-platform compilation, or Windows desktop runtime flow were executed. Native UIA/SAPI correctness and latency/resource targets require Windows evidence.
- macOS/Linux compile status was not executed here; source placeholders meet the intended typed-error shape but target-platform CI/build remains a planned verification step.

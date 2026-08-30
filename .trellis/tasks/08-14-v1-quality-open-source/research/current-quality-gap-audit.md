# Research: V1 quality/open-source current gap audit

- Date: 2026-08-30
- Scope: refresh the quality child task after the first three V1 children and the standalone Tauri E2E task landed.
- Evidence boundary: current repository source, tests, workflows, task archives, and local Git history. No product gate or manual Windows scenario was rerun during this planning refresh.

## Landed baseline — reuse, do not rebuild

- The translation, settings/localization/hotkeys, and desktop-result child tasks are archived. The parent task reports 3/4 children complete.
- PR #18 is merged at `8b6b250`; the standalone E2E task is archived at `80d6c00`.
- `e2e/app.e2e.ts` currently covers real-window startup/navigation, deterministic translation, error/retry, model persistence, and adding a favorite through real Tauri IPC.
- `scripts/run-e2e.mjs`, `src-tauri/tauri.e2e.conf.json`, the feature-gated WDIO plugins/capability, the Windows CI job, and `scripts/check-production-isolation.mjs` already exist.
- Existing frontend tests already cover `favorites-db`, `favorites-store`, `config-store`, theme, TTS store, settings view, translation envelope, and related utilities. New work must target uncovered behavior rather than duplicate these suites.
- MIT, CONTRIBUTING, Issue/PR templates, DCO, Dependabot, `cargo audit`, and `pnpm audit` workflows already exist and need regression verification only.

## Remaining delivery gaps

1. **Cross-language contract drift:** Rust defaults/serde and the hand-written TypeScript IPC/config mirrors do not yet share a stable fixture or equivalent failure-on-drift gate.
2. **Remaining test semantics:** `FavoritesView` still has no direct component test. Review settings/hotkey/selection/TTS coverage against the final contracts and add only missing semantic cases.
3. **Final V1 E2E scenarios:** the five existing desktop cases do not yet cover translation term tags, naming five-by-five, hotkey conflict recovery, or the mockable selection/TTS state path required by the quality PRD.
4. **Native/manual evidence:** the earlier desktop report proves UIA injection and IPC state, but explicitly leaves audible SAPI output and native tray-menu clicking for human confirmation. No final latency, memory, or idle-CPU measurement record exists.
5. **License notices:** `THIRD_PARTY_NOTICES`, `about.toml`, a notice-generation script, the `notices:generate` package script, and a CI drift check are absent.
6. **Final gates:** the full local gate, production isolation, desktop E2E, and supported-platform CI evidence must be refreshed after the remaining changes.

## Recommended execution order

1. Add the shared IPC/config contract regression first.
2. Fill only the remaining unit/component gaps.
3. Extend the existing E2E suite; do not replace its runner or isolation model.
4. Add deterministic license-notice generation and CI drift checking.
5. Record Windows manual/native and performance evidence.
6. Run the complete local and CI gate, then reconcile the parent task.

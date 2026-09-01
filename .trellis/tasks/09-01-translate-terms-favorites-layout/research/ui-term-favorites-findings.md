# Research: UI term tooltip, term favorites, and long favorite rows

- Query: Determine the smallest reliable implementation for (1) UI-language term explanations, (2) unclipped term tooltips, (3) reversible normalized term favorites with historical duplicate cleanup, and (4) three-line expandable favorite rows.
- Scope: internal
- Date: 2026-09-01

## Files Found

| File                                                                                                          | Relevance                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `crates/lingostack-core/src/prompt.rs:35-45`                                                                  | Builds the protected term-envelope instruction and currently asks for explanations in the source language.                  |
| `src-tauri/src/commands.rs:709-744`                                                                           | Resolves a plan and builds the effective prompt; the prompt command has only source/target inputs today.                    |
| `src/lib/ipc.ts:78-97`                                                                                        | TypeScript IPC wrappers for both commands.                                                                                  |
| `src/lib/i18n.ts:384-413`                                                                                     | `resolveLocale` is the canonical renderer-side resolution of `ui_language`, including the browser-locale rule for `system`. |
| `src/components/views/translate-view.tsx:26-75,229-385`                                                       | `TermTags` currently owns the clipped absolute tooltip; translate flow already knows the resolved UI locale.                |
| `src/lib/translation-envelope.ts:8-39`                                                                        | Term envelope has `term`, `category`, and `explanation`; validation deduplicates only within one response.                  |
| `src/lib/favorites.ts:8-119`                                                                                  | Favorite data model and pure helpers; no normalized identity exists.                                                        |
| `src/lib/favorites-db.ts:10-94`                                                                               | IndexedDB v1 uses a random `id` key and has no identity index or atomic toggle.                                             |
| `src/stores/favorites-store.ts:17-76`                                                                         | Store already owns optimistic add/remove and failure rollback.                                                              |
| `src/components/views/favorites-view.tsx:165-240`                                                             | Long rows are one horizontal flex line and lack shrink/wrap/clamp controls.                                                 |
| `src/components/views/translate-view.test.tsx:21-45` and `src/components/views/favorites-view.test.tsx:30-77` | Existing RTL coverage for tooltip keyboard behavior and favorite actions.                                                   |

## Findings

### 1. Term explanations must use the effective UI language

Root cause is confirmed: `compose_translation_prompt(base, source)` states `explanation 必须用 {source}` at `prompt.rs:40-45`. `effective_translation_prompt` passes `source` at `commands.rs:732-744`, so source language rather than user-facing interface language controls generated explanations.

Recommended contract:

1. Rename the second `compose_translation_prompt` argument conceptually to `explanation_language` and insert its display name in the protected protocol.
2. Add an explicit `effective_ui_language: Language` parameter to `effective_translation_prompt`, mirror it in `src/lib/ipc.ts`, and pass `resolveLocale(uiLanguage) === "zh" ? "zh" : "en"` from `TranslateView`.
3. Do not have Rust infer browser locale. `resolveLocale` already implements the only renderer-side `system` rule (`zh-*` => Chinese, otherwise English); Rust deliberately lacks this information, as the existing language-plan contract states.

This stays within the established IPC boundary and preserves the protected sentinel/JSON format. It changes explanation language only; source/target selection continues to be calculated by `TranslationPlan::resolve`.

Required tests: core unit test should assert the protected instruction says Chinese/English according to the explicit explanation language, irrespective of source language; command/IPC tests should assert the new camelCase field; the existing parser tests remain the guard for envelope compatibility. The e2e fixture term explanation is Chinese today (`commands.rs:542-545`) and needs an assertion consistent with its configured UI locale.

### 2. Tooltip is clipped because its containing scrollport establishes the clipping boundary

`TermTags` renders the tooltip as `absolute` beneath a `relative` inline wrapper (`translate-view.tsx:49-69`). That wrapper is inside the translated-text scrollport (`overflow-auto` at `:364-370`); the containing section also has `overflow-hidden` (`:352-385`). Increasing `z-index` cannot escape ancestor overflow clipping. Absolute positioning normally does not take layout space, so the screenshot's apparent "expansion" is a clipped/scrollport interaction rather than a valid overlay layer.

Recommended minimum reliable implementation in this React/Tauri WebView:

- Render the currently open tooltip with `createPortal(..., document.body)`, retaining `role="tooltip"` and the trigger's `aria-describedby`. A body portal leaves both overflow ancestors while staying in the same WebView/document.
- Hold a ref to the active tag. In `useLayoutEffect`, read `trigger.getBoundingClientRect()` and the portal tooltip's measured rect. Render the portal with `position: fixed`, initially hidden or at a provisional point, then set its coordinates.
- Prefer below the tag with a 6-8px gap; if `trigger.bottom + gap + tooltip.height` exceeds viewport height, place it above. Clamp `left` to an 8px viewport gutter and cap width with `max-width: calc(100vw - 16px)`. Clamp vertical position as a final guard for very tall explanations.
- While open, recompute on `window.resize` and on capture-phase `scroll` (the translated-text element scrolls independently); close on Escape, blur, and pointer leave as the current component does. Fixed coordinates plus remeasurement avoid stale positioning after the scrollport moves.
- Keep the portal informational/non-interactive (`pointer-events: none`) unless a later requirement adds controls inside it. This avoids the trigger's `onMouseLeave` immediately closing it while the pointer crosses into the portal.

No overlay library is needed for one trigger/one panel, and a React portal is supported by the browser DOM exposed in Tauri's WebView. The current UI contract specifically requires window-bounded overlay positioning for application menus (`ui-design.md` §5); the same flip/clamp rule is appropriate here.

RTL can keep asserting hover, focus, `aria-describedby`, tooltip text, and Escape. JSDOM cannot provide trustworthy layout boxes, overflow clipping, native compositor stacking, or portal pixel position; mock `getBoundingClientRect` for deterministic flip/clamp unit tests, but verify actual clipping/edge placement in a running desktop WebView at normal and minimum (864×576) window sizes.

### 3. Term-tag favorite state needs one pure identity and one IndexedDB transaction

The existing store is reusable but only exposes additive `add(term, meaning, source)` and id-based `remove(id)` (`favorites-store.ts:21-76`). `Favorite.id` is random (`favorites.ts:30-45`) and the v1 database has only its `id` key and `createdAt` index (`favorites-db.ts:10-25`), so it cannot currently answer or toggle by term + explanation. Repeated add operations can create historical duplicates.

Recommended minimal data design (no schema/index migration):

- Superseded by the user's 2026-09-01 acceptance clarification: use a pure term-only identity helper in `favorites.ts`. Normalize the term with Unicode-safe trim, collapsed whitespace, and locale case-folding; keep displayed `term`/`meaning` unchanged except existing trimming.
- The favorite-state helper must treat the same normalized term as already saved even when a later translation produces a different explanation. Tests cover whitespace/case, CJK, and differing explanations; toggling an active term removes all same-term historical rows atomically without silently rewriting their saved meanings.
- Add a database-owned `toggleFavoriteByKey(term, meaning, source)` that opens exactly one `readwrite` transaction, reads the store, identifies every matching key, and then either deletes every matching historical record (filled icon click) or writes one newly-created record (outline click). Resolve only at `tx.oncomplete`; abort/reject means no partial cleanup or toggle is committed.
- Add `dedupeFavorites()` as one `readwrite` transaction for load/import hygiene: group by `favoriteKey`, retain a deterministic canonical record (recommend newest `createdAt`, tie-break by `id`), delete all other ids, and return/read the survivors after completion. Call it during store load before publishing `list`. This cleans the existing duplicate history atomically without changing `DB_VERSION` or rewriting existing records.
- Expose a `toggle` action in the Zustand store. It may perform the existing optimistic list transition, but it must restore the exact `prev` list on the transaction rejection and refresh/sort the committed survivors on success. Do not compose `getAll` + `put/delete` through separate transactions: a crash or second window between them cannot satisfy atomic cleanup.

The term tag should call `void toggle(term.term, term.explanation, "翻译")`; its accessible name and `aria-pressed` must communicate add/remove and state, not color alone. Use the project's existing `Bookmark` icon with filled-state visual treatment rather than introducing a second icon system. On success, use the existing root Toast semantics; persist/transaction failures should use the established store error + `stringifyError` feedback and rollback.

The all-in-one transaction is intentionally a scan. Favorites are a small UI-only local list; the existing spec explicitly says no `idb`/`dexie` and reserves schema upgrades for actual schema changes. A compound identity index would require `DB_VERSION` migration and still would not replace explicit duplicate cleanup.

### 4. Favorite rows need bounded grid tracks and measured three-line disclosure

The screenshot follows directly from `FavoritesView`: each item is a flex row (`favorites-view.tsx:185-238`), its term has `min-w-[160px]` but no `min-w-0`, and the meaning's flex item also has no shrink/min-content escape. A long unbroken paragraph can therefore widen its intrinsic flex track and force metadata/actions into a narrow right rail.

Recommended row structure:

- Replace the content portion with a two-column grid using `minmax(0, <track>)` for term and meaning, followed by auto-sized metadata and actions; or retain flex only if both text regions get `min-w-0` and explicit bases. Grid makes the two textual columns independently shrinkable while keeping speech/delete actions reachable.
- Apply `min-w-0`, `break-words`, and `overflow-wrap:anywhere` to both text columns. `anywhere` is important for URLs, identifiers, and no-space CJK/ASCII tokens.
- Build a small view-local `ExpandableFavoriteText` component. Its collapsed state uses Tailwind's supported v3 `line-clamp-3` (the repository has Tailwind `^3.4.15`; no line-clamp plugin is configured), expanded state removes the clamp and exposes the complete text. Keep the list's one-layer, divide-y row treatment; do not introduce cards.
- Determine whether to show the expand/collapse control by measuring after layout: a collapsed element is overflowing when `scrollHeight > clientHeight + tolerance`. Recheck with `ResizeObserver` so resizing the app/sidebar updates eligibility. Do not display an inactive "展开" for three-or-fewer lines. Expanded content must be fully visible/wrap inside the same text cell; a button has `aria-expanded` and localized expand/collapse name.
- Track expanded ids in `FavoritesView` (or row-local state keyed by stable `f.id`); filtering/remounting naturally resets only unmounted rows. Default is collapsed as approved by the user.

### 5. Verification boundary

Vitest/RTL additions should cover observable contracts, not Tailwind class names:

- core + command/IPC: explanation language follows effective UI language while target/source language planning and envelope parsing remain unchanged;
- `TermTags`: outline/filled bookmark state, `aria-pressed`, add/remove toggle, failure rollback feedback, focus/hover/Escape tooltip semantics, and portal location in `document.body`;
- pure favorites: normalized identity equality/inequality and deterministic duplicate selection;
- IndexedDB (`fake-indexeddb`): one transaction deletes all historical duplicates or writes one entry; a deliberately aborted/error transaction leaves original data untouched;
- Zustand: optimistic toggle update, failure rollback, and post-load/import dedupe refresh;
- Favorites view: long/no-space content does not remove speech/delete controls, the disclosure is absent when mocked metrics do not overflow, and `aria-expanded` toggles only for mocked overflow.

JSDOM has no real line layout, `ResizeObserver`, scrollport clipping, or native Tauri rendering. It can test mocked overflow metrics and interaction state, but cannot prove the screenshot issue is visually fixed. Because this change alters a key result action and desktop overlay behavior, run the normal frontend gate (`pnpm lint`, `pnpm test`, `pnpm build`) and desktop E2E if its fixture can exercise the new term toggle. Independently perform Windows desktop acceptance in `pnpm tauri dev`: Chinese and English UI with an opposite-language source; hover/focus tag near all viewport edges and after scrolling; click favorite twice and reopen the Favorites page; add a legacy duplicate fixture; verify a long paragraph/URL at normal and 864×576 windows shows at most three lines by default, exposes expand only when truly truncated, expands to readable full text, and never pushes the right-side controls out of view.

## Related Specs

- `.trellis/spec/lingostack-app/frontend/index.md`: UI changes must use the current UI, state, component, and test contracts.
- `.trellis/spec/lingostack-app/frontend/state-management.md`: favorites must stay pure-logic → IndexedDB IO → Zustand composition; optimistic mutations roll back; schema changes require version migration; batch DB work is atomic.
- `.trellis/spec/lingostack-app/frontend/ui-design.md` §4-6: retain a single surface with divider rows, tokenized controls, min-window overflow handling, and viewport-clamped overlays.
- `.trellis/spec/lingostack-app/frontend/testing-and-a11y.md`: RTL tests use semantic roles/states and distinguish jsdom from desktop evidence.
- `.trellis/spec/lingostack-app/backend/ipc-commands.md` “翻译语言计划、术语信封与共享冷却”: the protected term protocol may not be removed and explicit effective system language is required when browser-derived.
- `.trellis/spec/lingostack-app/backend/testing-strategy.md`: pure frontend changes require lint/test/build; real desktop evidence is distinct.

## Caveats / Not Found

- `ui_language` currently resolves only to Chinese or English in renderer `i18n.ts`; Japanese is a translation language but not a UI dictionary. The stated requirement therefore yields Chinese/English explanations until product-level Japanese UI support exists.
- Existing term validation deliberately keeps only terms found in source or translation and caps at five. The proposal does not alter that contract.
- A portal eliminates overflow clipping, not all accessibility concerns: keyboard focus remains on the tag and the portal needs a stable id; the tooltip must close/reposition when the trigger unmounts or scrolls away.
- Real desktop E2E currently has term fixture output (`commands.rs:542-545`), but its coverage of a portal, visual clipping, and measured three-line truncation has not been established in this research. Those require either new semantic E2E hooks/assertions or manual Windows acceptance.

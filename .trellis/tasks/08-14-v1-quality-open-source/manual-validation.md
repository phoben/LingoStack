# Windows V1 manual validation record

## Evidence boundary

This record is deliberately separate from unit, build and desktop-WebDriver evidence. A passing Rust test or WDIO case does not prove an external application selection, a physical speaker, a native tray click, or measured process resource use.

## Environment

- Date / operator: 2026-08-30 13:37-13:40 and 14:29-14:31 +08:00, Codex through Orca computer-use 1.4.191
- Windows version: Windows 11 Pro 10.0.26200 (build 26200)
- Audio devices: Windows reported several healthy devices, including ICON ProAudio MUV, USB Audio Device, Realtek High Definition Audio and NVIDIA audio. Device enumeration does not prove audible output.
- App build and commit: debug binary built 2026-08-30 13:24:46 +08:00 from HEAD `fe5ed1e61105fbc2fe3d488937e7a5acb135342b` plus the current uncommitted task changes

## Required scenarios

| Scenario | Method | Expected result | Actual result |
| --- | --- | --- | --- |
| External selection | Selected all of `manual-selection-source.txt` in Windows Notepad and pressed Ctrl+Shift+D | Main window receives the selection and translates it | **Pass for selection/window routing.** LingoStack received the exact 49-character sentence and attempted translation. The configured provider then returned HTTP 402, which is recorded separately from selection success. |
| Clipboard fallback | Cleared the Notepad selection, temporarily placed a unique sentence on the clipboard, pressed Ctrl+Shift+D, then restored the prior clipboard text | Translation view identifies clipboard fallback without losing text | **Pass.** UI showed “未能直接读取辅助功能选区，已使用剪贴板中的文本。” and the source field exactly matched `LingoStack clipboard fallback validation sentence.` |
| SAPI speak / stop | Clicked “朗读 原文”, observed the control, then clicked it again | Audible speech starts and stops promptly | **Partial.** The real app changed `朗读 原文` → `停止朗读` → `朗读 原文`, proving the command/state round trip. Audible output was not observable by the automation operator and remains human-only. |
| Native tray | Closed the main window and inspected process/window state | Main window action, translate-selection action and quit action behave as labelled | **Partial.** Closing hid the main window while exactly one resident process remained. The current operator's capability report explicitly has `surfaces.menus=false` and `surfaces.menubar=false`, so clicking the three tray-menu actions and confirming Quit remain unexecuted. |
| Single instance | Started a second executable while the first was visible, then repeated while the first window was hidden | Existing instance is focused; no duplicate resident process | **Pass.** In both cases the new PID exited, the original PID remained, process count stayed at one, and the hidden existing window was restored on the second check. |
| Perceived latency | Triggered a real provider translation from the external-selection and clipboard scenarios | Under 3 seconds; record three runs | **Blocked by external account state.** The configured provider returned HTTP 402 `Insufficient Balance`; no successful first visible translation existed to time, so the <3 s threshold is not claimed. |
| Resident resources | Sampled PID 32276 after leaving the app idle for 60 seconds using `Get-Process` CPU-time deltas and working/private memory; repeated with a freshly built production-config debug executable PID 3760 | Memory under 150 MB and CPU near 0%; record the sampling command and values | **Pass.** First sample at 2026-08-30 13:40:01 +08:00: working set 56.73 MB, private memory 14.94 MB, CPU delta 0.000% over 60 s (both one-core and 28-logical-processor machine-normalized calculations). Repeat at 14:31:40 +08:00, after 104 s resident with no app interaction after the initial window observation: working set 36.26 MB, private memory 6.97 MB, accumulated CPU 0.15625 s. Including startup makes the latter a conservative whole-lifetime upper bound, 0.150% of one core / 0.0054% normalized across 28 logical processors; it is not presented as a separate pure-idle delta. |

## Observations

- The first clipboard-fallback attempt ended after the original debug process was no longer running, before a post-state could be captured. A fresh instance repeated the same scenario successfully and stayed resident; this one-off exit was not reproduced and is not counted as a pass or a confirmed defect.
- Screenshots and accessibility snapshots were captured by Orca during the run. The evidence asserted above comes from refreshed post-action UI trees, process enumeration and resource counters, not from unverified synthetic-key acknowledgements alone.
- The repeat PID 3760 remained normally observable as `LingoStack · 译栈`; its final pre-stop snapshot was 36.31 MB working set, 6.90 MB private memory and 0.203125 s total CPU. The process was then stopped by its starter and verified absent. This supports the resident-resource observation only; neither automation state nor device enumeration is treated as proof that SAPI was audible.

## Recording rules

- Record actual measurements, commands, timestamps and failures; do not replace them with code inspection.
- If a scenario cannot run because of machine policy, audio routing, credentials or platform support, record that condition as **not executed** rather than pass.

## Final local and remote gate evidence

At 2026-08-30 14:28-14:29 +08:00, the current local worktree passed the complete repeatable gate:

- `cargo fmt --all --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace` (132 Rust unit tests plus doc-tests), and `cargo build --workspace` all exited 0.
- `pnpm lint`, `pnpm build`, and `pnpm test` all exited 0; Vitest reported 23 files and 155 tests passing.
- `pnpm test:production-isolation` exited 0 and reported `production isolation checks passed`; `pnpm notices:generate` followed by `git diff --exit-code -- THIRD_PARTY_NOTICES` exited 0.
- `pnpm test:e2e` rebuilt the e2e-only binary and WebdriverIO reported its one spec passed (the suite's JUnit contains 10 cases).

Remote supported-platform evidence is currently blocked outside this worktree. On `origin/develop` at `df7591a`, [CI run 33296833111](https://github.com/phoben/LingoStack/actions/runs/33296833111) and [Audit run 33296833135](https://github.com/phoben/LingoStack/actions/runs/33296833135) were inspected without rerunning or mutating GitHub. Both show every job with `steps=[]` and `runner_id=0`; no test/build/audit step executed. Their check annotation says recent account payments failed or the spending limit must be increased. Therefore these failures are an account-billing scheduling blocker, not evidence of a code-gate failure; macOS/Linux/Windows hosted CI remains unproved until the account can schedule runners.

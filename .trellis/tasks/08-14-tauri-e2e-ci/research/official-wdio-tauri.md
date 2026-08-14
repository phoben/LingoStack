# Research: official-wdio-tauri

- Query: What is the current official WebdriverIO/Tauri 2 guidance for `@wdio/tauri-service`, especially the embedded provider, test-only plugin isolation, CI support, diagnostics, and platform limits?
- Scope: mixed (official external documentation plus current repository integration points)
- Date: 2026-08-14

## Findings

### Recommended stack and dependency relationship

1. Tauri’s current WebDriver page explicitly recommends WebdriverIO plus `@wdio/tauri-service` for Tauri, and identifies support on Windows, Linux, and macOS. The minimal service configuration uses `driverProvider: 'embedded'` with an application binary path. [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/) (updated 2026-06-29).
2. The service is an npm **development dependency** (`pnpm add -D @wdio/tauri-service`). It brings the WDIO runner/service layer; select a runner/framework/reporter explicitly rather than expecting the service alone to provide them. [WDIO Tauri Service](https://webdriver.io/docs/wdio-tauri-service/), [WDIO test runner](https://webdriver.io/docs/testrunner/).
3. Two distinct Rust/JS plugins are involved:

   | Component                                                     | Required for                                                                      | Integration implication                                                        |
   | ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
   | `tauri-plugin-wdio-webdriver`                                 | embedded provider                                                                 | Runs the in-process W3C WebDriver HTTP server; Rust-only.                      |
   | `tauri-plugin-wdio` plus frontend `@wdio/tauri-plugin` import | `browser.tauri.execute()`, IPC mock interception, frontend/backend log forwarding | Needed for this task’s deterministic IPC/LLM mock and diagnostic requirements. |

   The distinction and capabilities are specified in [Plugin Setup](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup/). Basic element interaction can work without `tauri-plugin-wdio`, but mocking, execute, and log capture cannot; therefore this project needs both plugins for its stated E2E scope.

4. Registry versions were revalidated during implementation on 2026-08-14: `@wdio/tauri-service` and `@wdio/tauri-plugin` **1.3.0**, both Rust plugins **1.3.0**, and the selected WDIO runner/framework/reporter line **9.30.1**. Exact resolutions remain owned by `pnpm-lock.yaml` and `Cargo.lock`, not by prose. [docs.rs crate page](https://docs.rs/tauri-plugin-wdio/latest/tauri_plugin_wdio/).

### Embedded-provider operation and isolation

1. With `driverProvider: 'embedded'`, WDIO spawns the app with `TAURI_WEBDRIVER_PORT`; the app hosts the server (default 4445) and WDIO terminates the app after tests. This means E2E should use one worker initially and a dedicated result/log directory; do not pre-start the app or independently allocate the same port. [Plugin Setup](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup/).
2. On Windows/Linux, set `driverProvider: 'embedded'` explicitly (or set `TAURI_WEBDRIVER_PORT`); auto-detection is otherwise not guaranteed. macOS auto-detects embedded but an explicit selection is clearer and cross-platform. [WDIO troubleshooting](https://webdriver.io/docs/desktop-testing/tauri/troubleshooting/).
3. Official production guidance says the plugins are test-only. For `tauri-plugin-wdio`, use an optional Cargo dependency/feature and conditionally register it; the docs also show debug-only registration. For the embedded server, docs show a `cfg(debug_assertions)` target dependency plus conditional registration. The build used by E2E must enable the test feature (or be debug), while normal `cargo tauri build --release` must not. [Plugin Setup, production and embedded sections](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup/).
4. Capability isolation must follow code isolation: place `wdio:allow-*` and `wdio-webdriver:default` only in a test/debug capability that is included by the E2E build, not the default production capability. `wdio-webdriver:default` currently exposes no IPC commands but makes the plugin ACL manifest load; `wdio:allow-execute` is sufficient for the JS/mock API if a narrower surface than `wdio:default` is wanted. [Plugin Setup](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup/).

### Platform and CI conclusion

1. Officially documented provider support is: Windows embedded/external/CrabNebula; Linux embedded/external/CrabNebula; macOS embedded/CrabNebula. External is Windows/Linux only; macOS’s non-paid native route is embedded. [WDIO Tauri Service](https://webdriver.io/docs/wdio-tauri-service/), [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/).
2. Linux’s traditional external route needs `webkit2gtk-driver` and headless CI needs Xvfb; these requirements do **not** establish embedded CI reliability. The old Tauri CI sample is specifically `tauri-driver`-based, not evidence for embedded provider. [Tauri CI guide](https://v2.tauri.app/develop/tests/webdriver/ci/).
3. **Recommended gate:** implement a blocking `windows-latest` embedded E2E job first and collect real run evidence there. Add Linux/macOS to a blocking matrix only after each has a successful embedded-provider CI execution recorded; until then their YAML/configuration can be checked statically but must not be presented as executed evidence. This is conservative because official docs claim support but provide no platform-specific embedded GitHub Actions proof in the cited CI guide.
4. The only currently observed runtime platform is Windows (per user-supplied baseline; independently revalidate in implementation). Thus this research supplies official compatibility evidence, not a local Linux/macOS execution result.

### Reporting, logs, screenshots, cleanup

1. Enable the service’s frontend/backend log capture for the test run; those capabilities require `tauri-plugin-wdio`. The WDIO service documents log capture and plugin setup confirms it. Keep a stable result root such as `artifacts/e2e/` so CI can upload it after failure. [WDIO Tauri Service](https://webdriver.io/docs/wdio-tauri-service/), [Plugin Setup](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup/).
2. Use the official `@wdio/junit-reporter` to write per-runner XML to a known directory. It supports `outputDir`, a deterministic `outputFileFormat`, and worker logs (`addWorkerLogs`). [Junit Reporter](https://webdriver.io/docs/junit-reporter/).
3. Add an `afterTest` hook that calls `browser.takeScreenshot()` only when the test has an error; this is the official WDIO pattern. The screenshot path/result directory should be uploaded with WDIO and app logs. [Allure Reporter screenshot hook](https://webdriver.io/docs/allure-reporter/). Allure is optional; JUnit + saved screenshots/logs is sufficient and avoids an unnecessary reporting stack.
4. Upload test results/screenshots/logs even after a failed test step. GitHub documents artifacts as the intended persistence mechanism for test output, logs, failures and screenshots, and documents `if: ${{ always() }}` for post-failure upload steps (not for critical setup steps). [GitHub Actions artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts), [GitHub expressions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions).
5. WDIO states the service terminates the app on test completion. Add defensive suite cleanup and a Windows port/process diagnostic only on abnormal exit; validate a second sequential run in CI/local test evidence to prove no stale process/port rather than relying solely on that claim.

### Current repository fit

- `package.json` currently has Vite/Vitest/Tauri CLI only; no WDIO runner, service, framework, or reporter dependency/script.
- `src-tauri/Cargo.toml` currently has no WDIO feature/dependency; default feature is `custom-protocol`.
- `src-tauri/capabilities/default.json` is the production main-window capability and currently has no WDIO permissions. Keep it production-only; add an explicit E2E/debug capability instead of broadening it.
- `src-tauri/tauri.conf.json` declares a single `main` window and normal `dist`/Vite build commands. The E2E configuration must provide an actual app binary built with its test-only Rust feature, not attach to a Vite-only renderer test.

## Recommended acceptance implications

- A documented `pnpm test:e2e` must build/locate a feature-enabled debug test binary, run WDIO with `driverProvider: 'embedded'`, exit non-zero on a failing spec, and leave JUnit/log/screenshot paths predictable for CI.
- Tests may use `browser.tauri.mock()` to intercept the exact backend IPC command used by translation. Mock responses must cover deterministic success and rejection/error; no API key or network access may be required. Verify plugin availability at suite startup before asserting mocks, using the API documented in [Plugin Setup](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup/).
- Production proof must include a release build without the `wdio` feature and a source/config check that production capabilities do not grant `wdio:`/`wdio-webdriver:` permissions.
- WDIO verifies the app’s webview DOM and test plugin boundary. It does not independently prove OS-wide hotkey dispatch, external-app selection/UIA access, or actual speaker output; those need Windows-native automated checks where feasible and otherwise a reproducible manual Windows validation script.

## Caveats / Not Found

- Terminology is in transition: the service overview calls `embedded` the default on all platforms, while troubleshooting says Windows/Linux only auto-detect it when `TAURI_WEBDRIVER_PORT` is set. Avoid ambiguity by configuring `driverProvider: 'embedded'` explicitly.
- Some WDIO pages still label `driverProvider: 'official'`; service documentation says it is a deprecated alias for `external` and will be removed in v2. New configuration must use `external` only if deliberately falling back from embedded.
- Tauri’s CI page is external-`tauri-driver` guidance, dated 2025-08-30; it must not be copied as an embedded-provider CI recipe.
- No official source found that establishes a proven GitHub-hosted Linux/macOS embedded-provider run for this repository. Claim cross-platform runtime support only after actual matrix jobs execute successfully.

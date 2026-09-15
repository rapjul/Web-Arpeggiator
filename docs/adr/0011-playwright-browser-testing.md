# 0011. Playwright for Browser End-to-End Testing

* Status: accepted
* Deciders: rapjul, Codex
* Date: 2026-09-15

## Context and Problem Statement

The project needs two complementary confidence signals. Fast, instrumented unit tests are well suited to pure music logic, storage normalization, controller contracts, and audio-routing factories. Browser behavior—PWA registration, IndexedDB persistence, Web Audio activation, canvas rendering, responsive layout, and downloads—needs a real browser instead.

The previous browser suite drove a separately spawned Agent Browser process from Bun tests. That duplicated server and browser lifecycle management in each suite, offered limited diagnostics, and did not give each scenario an isolated browser context.

## Decision Drivers

* Keep fast unit feedback and V8 coverage without moving suitable tests into a browser.
* Run end-to-end scenarios in an isolated Chromium context against the production preview build.
* Make failure traces and screenshots available without retaining them for successful runs.
* Avoid private application test bridges and assert through public UI and browser APIs.

## Decision Outcome

Vitest remains the unit-test and V8-coverage runner. Playwright owns all end-to-end browser scenarios under `tests/e2e/` and starts one managed Vite preview server on a stable local URL.

The Playwright suite runs Chromium serially. Each test receives an isolated Playwright context; the project-level E2E helper centralizes only cross-scenario actions such as PWA readiness, user-gesture audio activation, IndexedDB reset, and MIDI-export decoding. Browser tests use the rendered UI, downloads, and standard platform APIs rather than application-private globals.

Continuous integration runs the browser suite in a separate Chromium job. Traces, screenshots, and the HTML report are uploaded only when that job fails.

### Positive Consequences

* Browser scenarios run against the production build with a well-supported test runner.
* Playwright supplies locator auto-waiting and useful failure diagnostics.
* Unit coverage remains fast, focused, and comparable over time.
* The split makes runner ownership clear for future contributors.

### Negative Consequences

* Chromium must be installed for local browser-test runs and in CI.
* Browser scenarios take longer than unit tests and therefore run in a separate job.
* Cross-browser coverage remains deliberately deferred until Chromium coverage is stable.

## Links

* [Playwright configuration](../../playwright.config.ts)
* [E2E test helpers](../../tests/e2e/test-helpers.ts)
* [ADR 0001: Vitest and V8 Coverage Tooling](./0001-vitest-and-v8-coverage-tooling.md)

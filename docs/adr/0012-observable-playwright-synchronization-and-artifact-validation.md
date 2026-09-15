---
status: accepted
date: 2026-09-15
decision-makers: [rapjul, Codex]
consulted: []
informed: []
---

# Use Observable Browser States and Real Download Artifacts

## Context and Problem Statement

Playwright's migration replaced a process-driven browser adapter, but browser tests can still become flaky or miss user-visible defects when they wait for elapsed time or inspect a browser implementation detail. A real-time recording was previously offered as a `.wav` download even though its bytes were a recorder blob in another container format; an intercepted download action could not reveal that defect.

The project needs browser tests that synchronize with an observable application or platform state and validate files as users receive them, while keeping pure encoding and parsing details in fast unit tests.

## Decision Drivers

* Detect regressions in user-visible browser behavior rather than implementation details.
* Make asynchronous scenarios reliable in local development and CI.
* Keep E2E tests focused on browser boundaries and keep unit tests fast and precise.
* Preserve useful Playwright traces and diagnostics when a public contract fails.

## Considered Options

* Use observable browser states and real download artifacts.
* Retain elapsed-time waits and browser-global interception.
* Move all export-format validation into unit tests.

## Decision Outcome

Chosen option: "Use observable browser states and real download artifacts", because it verifies the contract delivered to the user while relying on Playwright's web-first waiting model.

Playwright tests must wait for a meaningful public condition: a locator assertion, canvas change, recording state, IndexedDB record, service-worker state, or browser event. They must not use arbitrary elapsed-time waits. A fixed delay is allowed only when elapsed time is the behavior under test, and the test must explain why no observable condition exists.

Tests of downloaded artifacts must capture the browser's `download` event, then assert the suggested filename and format-specific bytes or decoded contents. They must not patch `URL.createObjectURL`, intercept anchor clicks, or use application-private test globals. Unit tests remain responsible for detailed encoder, parser, normalization, and error-recovery behavior.

### Consequences

* Good, because tests observe the same exports and asynchronous states users receive.
* Good, because web-first waits reduce timing-related CI flakes and improve failure diagnostics.
* Good, because unit and E2E tests retain complementary, non-duplicative responsibilities.
* Bad, because browser tests need carefully chosen public readiness signals and can take longer to implement.
* Neutral, because a browser download header check complements rather than replaces full encoder unit tests.

### Confirmation

The Chromium CI job runs the Playwright suite. Real-time WAV and MP3 scenarios capture browser downloads and validate their RIFF and MPEG frame signatures; the unit suite verifies the encoders' detailed binary behavior. Reviewers check new browser scenarios for observable waits and public contracts.

## Pros and Cons of the Options

### Use Observable Browser States and Real Download Artifacts

* Good, because it catches mismatches between a file's name and its delivered bytes.
* Good, because it aligns tests with Playwright locators, events, and auto-waiting.
* Bad, because meaningful conditions require more product understanding than a generic sleep.

### Retain Elapsed-Time Waits and Browser-Global Interception

* Good, because it can be quick to write for a narrow scenario.
* Bad, because it is prone to CI timing variation and can miss an incorrect delivered artifact.
* Bad, because it couples tests to browser implementation details instead of public behavior.

### Move All Export-Format Validation into Unit Tests

* Good, because binary parsers and encoders run quickly and deterministically in Vitest.
* Bad, because it cannot prove the browser downloaded the encoded result with the intended name.

## More Information

This supplements [ADR 0011](./0011-playwright-browser-testing.md): ADR 0011 assigns runner ownership, while this record defines the synchronization and artifact-validation rules for Playwright scenarios.

The coverage ratchet is intentionally independent from Playwright. `vitest.config.ts` is the source of truth for the current enforced thresholds and their eventual 80/70/80/80 target.

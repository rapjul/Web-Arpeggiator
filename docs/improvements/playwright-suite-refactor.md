# Playwright Suite Refactor

## Goal

Refactor the migrated browser suite into small, independently reported Playwright scenarios without expanding product coverage solely for the migration.

## Why Later

The current Chromium suite already exercises the important browser-only behavior: PWA lifecycle, IndexedDB persistence, audio activation, controls and accessibility, pattern behavior, downloads, responsive layout, and canvas rendering. Keeping this refactor separate avoids mixing a runner migration with broad assertion rewrites.

## Improvement Plan

1. [x] Replace the PWA compatibility commands with typed fixtures and split manifest/service-worker readiness, browser preset and session persistence, offline audio, and cache controls into separate scenarios.
2. [x] Refactor audio exports: capture MIDI, real-time WAV, and offline WAV downloads with `page.waitForEvent("download")`, then validate their actual bytes. The real-time path now encodes a RIFF WAV instead of relabeling a recorder blob.
3. [x] Refactor timing-sensitive visualizer, meter, recording, and debounced-session checks to wait for observable canvas pixels, UI state, recording availability, or IndexedDB records instead of elapsed-time sleeps.
4. [x] Convert the remaining interaction suites—onboarding, presets, keyboard, patterns, synth effects, history, responsive layout, and micro-guidance—to direct `Page` and `Locator` APIs. Split each current suite by user behavior rather than file ownership.
5. [x] Retire the command-style `runBrowser` adapter after its last consumer migrated. Keep cross-scenario setup as typed fixtures and public browser-platform helpers; do not restore application-private test globals.

## Tests to Add While Refactoring

Add a test only when it protects a user-visible contract that the split would otherwise lose. The first slices should retain, not broaden, current coverage. Completed additions are:

- [x] A download-event assertion that verifies the MIDI file is delivered with the expected name and decodable bytes.
- [x] A real-time recording download assertion after the recorder exposes the export control.
- [x] One isolated PWA regression for a partial IndexedDB schema, ensuring reset clears every existing known store and surfaces unexpected transaction failures.
- [x] One independent offline-start scenario, so lazy-module caching failures are reported separately from manifest, preset, or cache-control failures.

Do not add E2E tests just to reach a number. Pure validation, normalization, and error-recovery branches belong in Vitest unit tests; real browser boundaries belong in Playwright.

## Coverage Goal

Playwright does not feed the V8 percentage gate. Its goal is reliable, behavior-focused Chromium coverage with useful diagnostics. The currently enforced Vitest ratchet is 70% statements, 60% branches, 60% functions, and 70% lines. The long-term unit-test target remains 80% statements, 70% branches, 80% functions, and 80% lines, raised gradually when meaningful source-level tests support it.

## Result

The Chromium suite is now Playwright-native. Future browser coverage should start from the typed fixture and a public browser or UI contract; keep pure validation, normalization, and defensive recovery in Vitest.

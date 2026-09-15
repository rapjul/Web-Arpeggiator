# Playwright Suite Refactor

## Goal

Refactor the migrated browser suite into small, independently reported Playwright scenarios without expanding product coverage solely for the migration.

## Why Later

The current Chromium suite already exercises the important browser-only behavior: PWA lifecycle, IndexedDB persistence, audio activation, controls and accessibility, pattern behavior, downloads, responsive layout, and canvas rendering. Keeping this refactor separate avoids mixing a runner migration with broad assertion rewrites.

## Improvement Plan

1. Replace the command-style `runBrowser` compatibility adapter with typed Playwright fixtures and direct `Page`/`Locator` usage.
2. Split each coarse suite into behavior-focused tests so failures identify one scenario rather than an entire feature area.
3. Replace fixed waits with Playwright web-first assertions and observable DOM, download, IndexedDB, canvas, or service-worker states.
4. Use `page.waitForEvent("download")` for export assertions instead of browser-side download interception.
5. Keep test isolation through fresh contexts and public browser APIs; do not restore application-private test globals.

## When to Do It

Schedule this as a dedicated follow-up after the Playwright migration PR lands, or bundle a focused scenario split with the next browser-facing feature that touches the relevant suite.

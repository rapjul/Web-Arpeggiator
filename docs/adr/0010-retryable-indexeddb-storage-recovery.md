# 0010. Retryable IndexedDB Storage Recovery

- Status: accepted
- Deciders: rapjul, Codex
- Date: 2026-09-13

## Context and Problem Statement

Saved presets and the autosaved workspace session share the `web-arpeggiator-presets` IndexedDB database. A browser profile can reject `indexedDB.open()` with an `UnknownError` even though the same application works in a fresh profile. Previously, the storage module retained the rejected open promise, so every later preset save, preset load, and session restore failed until the page reloaded.

The immediate cause may be transient browser storage state, profile corruption, quota policy, or another browser-owned condition. Application code must recover from transient failures without claiming it can repair a persistently unavailable profile. It must also avoid deleting the stored presets or the last session automatically, because that recovery step is destructive.

## Decision Drivers

- Allow a later preset or session operation to recover from a transient database-open failure.
- Keep concurrent callers coordinated around one active database-open attempt.
- Release stale connections when another browser context changes the database version.
- Give users clear, non-destructive recovery guidance when browser storage remains unavailable.
- Preserve a testable contract for this failure mode.

## Decision Outcome

The storage module caches only the current successful or in-flight IndexedDB open attempt. When an open attempt rejects, it clears that cached promise only if the failed attempt is still current. The next storage operation therefore calls `indexedDB.open()` again, while concurrent callers of one attempt continue to share the same promise.

A successful database handle listens for `versionchange`, closes itself, and clears its cached attempt. A later operation then opens a current connection instead of reusing a stale handle.

The application never automatically clears or deletes `web-arpeggiator-presets`. On storage errors or unavailability, it reveals recovery guidance: retry the action first; if the problem persists, export the current preset as JSON before manually deleting the database in browser site-storage tools and reloading. The guidance explicitly warns that deletion removes locally saved presets and the last session. It is hidden again after browser storage works.

Tests must simulate an `UnknownError` followed by a successful open, and a version-change event followed by reconnection. Fresh-profile success tests alone are insufficient because they do not exercise a rejected cached open attempt.

### Positive Consequences

- Transient IndexedDB failures no longer permanently disable preset and session storage for the page lifetime.
- Users retain control over destructive recovery and receive backup instructions before it.
- Version changes do not leave a cached stale connection in the storage layer.
- Regression coverage protects the shared preset and session failure boundary.

### Negative Consequences

- Repeated actions can retry a persistently failing browser profile and show recovery guidance again.
- The application cannot recover data from a corrupted or policy-blocked database without user action.
- Manual database deletion remains browser-specific and permanently removes local data.

## Links

- [Preset Store](../../src/storage/presets-store.js)
- [Application Recovery UI](../../src/app.js)
- [ADR 0002: Modular ES Source Architecture](./0002-modular-es-source-architecture.md)
- [ADR 0003: Defensive Input Validation and Edge-Case Testing Policy](./0003-defensive-input-validation-and-edge-case-testing-policy.md)

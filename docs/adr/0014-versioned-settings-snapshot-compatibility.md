---
status: accepted
date: 2026-09-16
decision-makers: [rapjul, Codex]
consulted: []
informed: []
---

# Version Settings Snapshots and Require an Explicit Future-File Override

## Context and Problem Statement

Settings cross several durable boundaries: downloaded presets, IndexedDB records, autosaved sessions, undo/redo history, URLs, and offline-export metadata. Before the versioned contract, a changed field shape could be mistaken for a valid current snapshot, or a newly added setting could be silently lost. The application needs to preserve valid legacy data while avoiding destructive or misleading loads from a newer application version.

## Decision Drivers

* Keep existing unversioned presets, sessions, and history usable after the migration.
* Make current snapshots complete, bounded, and unambiguous at every persistence boundary.
* Reject malformed and future versions without changing live settings or history.
* Permit a user who intentionally imports a newer JSON file to recover supported fields with clear consent.
* Avoid presenting an override for browser-managed state that may be loaded automatically at startup.

## Considered Options

* Version every settings snapshot and allow an explicit compatibility override only for JSON file imports.
* Version snapshots but normalize every newer version automatically.
* Reject all unversioned snapshots and require users to recreate presets.
* Maintain separate migration code for every persistence destination.

## Decision Outcome

Chosen option: "Version every settings snapshot and allow an explicit compatibility override only for JSON file imports," because it keeps legacy data useful without automatically applying a potentially incompatible future configuration.

`src/core/settings-contract.js` is the canonical source for `settingsVersion`, defaults, allowed values, numeric bounds, and derived notes. Every current snapshot is written as version 1. A missing version is treated as legacy and normalized into the complete current shape. Any supplied malformed version is rejected. Valid future versions are also rejected by default.

Only the user-initiated JSON file-import path may offer an override. It first leaves the live state untouched and opens an accessible confirmation dialog. Choosing Load Compatible Settings performs best-effort normalization of supported fields into a version-1 snapshot; cancelling retains the existing state. Browser presets, sessions, history, URLs, and export metadata have no override path: incompatible automatic state is skipped or rejected safely. Future browser records remain visible for a later compatible application rather than being silently deleted.

### Consequences

* Good, because all persistence boundaries use one explicit compatibility contract.
* Good, because legacy user data preserves valid values, including valid history stacks.
* Good, because newer file imports require deliberate user consent before supported fields are loaded.
* Bad, because a newer browser preset or session cannot be force-loaded after a downgrade.
* Neutral, because a future schema version requires a migration decision and tests before it becomes supported.

### Confirmation

Unit tests cover complete current snapshots, legacy normalization, invalid-version rejection, future-version rejection and override, history restoration, and preservation of future IndexedDB records. Browser tests cover the confirmation dialog's cancel, focus, Escape, and explicit compatible-load paths. Export metadata tests verify the versioned snapshot contract.

## Pros and Cons of the Options

### Version Snapshots with a File-Import Override

* Good, because the user can intentionally recover fields from a newer JSON preset.
* Good, because automatic browser restoration remains non-destructive.
* Bad, because the UI needs an accessible compatibility-confirmation flow.

### Normalize Every Newer Version Automatically

* Good, because users see fewer rejections.
* Bad, because unknown settings can be lost or change the intended sound without consent.

### Reject Unversioned Snapshots

* Good, because every accepted snapshot has an explicit schema version.
* Bad, because it needlessly discards existing user presets and sessions.

### Maintain Per-Destination Migration Code

* Good, because each destination could evolve independently.
* Bad, because behavior would drift across imports, sessions, history, URLs, and exports.

## More Information

* [ADR 0006: Persistent Settings History and Default Resets](./0006-persistent-settings-history-and-default-resets.md)
* [ADR 0009: Versioned Offline Audio Export Metadata](./0009-versioned-offline-audio-export-metadata.md)
* [Settings History and Defaults](../history-and-default-settings.md)

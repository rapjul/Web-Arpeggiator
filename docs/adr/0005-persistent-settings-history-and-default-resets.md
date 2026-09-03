# 0005. Persistent Settings History and Default Resets

* Status: accepted
* Deciders: rapjul, Codex
* Date: 2026-09-03

## Context and Problem Statement

Web Arpeggiator exposes many interconnected settings.
A user can edit them directly, load a preset or URL preset, import a file, generate notes, select a chord, or add notes from the virtual keyboard.
Before this decision, there was no way to reverse one of those changes or return to the built-in starting configuration without manually reconstructing it.

The application already persists the last session in IndexedDB.
History needs to survive a refresh without making malformed, obsolete, or missing stored records prevent the application from starting.
Restored settings must also use the existing settings loader so audio routing, pattern rendering, loop maps, and export-duration estimates remain synchronized.

## Decision Drivers

* Give users a reliable way to recover from edits, imports, and generated content.
* Keep history bounded and predictable in browser storage.
* Preserve the current session-restoration contract without an IndexedDB schema migration.
* Keep playback, recording, and other ephemeral state out of settings history.
* Make Reset All reversible instead of destroying a user's prior work.

## Decision Outcome

Chosen approach: **persistent, full serialized-settings snapshot history**,
defined as follows:

1. **History model**:
   - A pure core history manager owns immutable, serializable `{ past, present, future }` snapshots.
   - The undo stack retains at most 100 prior snapshots.
   - Adding a new edit after an undo clears redo history.
   - Repeated equivalent snapshots are suppressed.
   - Consecutive input events are coalesced until the input is committed, preventing slider drags from consuming the history cap.

2. **History scope**:
   - Every setting returned by `getAllSettings()` belongs to a snapshot, including transport, pattern, scale, synth, envelope, filter, effects, and offline loop-count settings.
   - Direct edits, preset and URL loads, file imports, randomization, chord starters, virtual-keyboard pattern additions, individual resets, and Reset All create history entries when they change serialized settings.
   - Playback, recording, visualizer state, virtual-keyboard mode, preset names, storage controls, recordings, and exports remain outside history.

3. **Persistence and restoration**:
   - History is saved alongside the existing last-session record rather than in a separate store.
   - On restoration, malformed or incompatible history falls back safely to a history initialized from the restored current settings.
   - Legacy session records with no history remain valid.
   - Applying a historical snapshot always goes through the existing settings loader.

4. **Default restoration**:
   - The canonical defaults are captured after initial application setup and before session restoration.
   - Reset All applies that captured snapshot as an ordinary, undoable change; it does not clear history.
   - Per-setting reset gestures apply the captured default for that logical setting, with Scale Quantization and Scale Type treated as one group and Scale Root treated separately.

### Positive Consequences

* Users can safely explore edits and recover prior work across refreshes.
* One bounded, serializable data structure makes history straightforward to test and persist.
* The existing settings loader remains the single synchronization path for live audio and derived UI state.
* Reset All and individual reset actions are recoverable through Undo.

### Negative Consequences

* Full snapshots duplicate settings values, although the 100-entry cap bounds the storage cost.
* New serialized settings must be included in settings serialization to gain
  history support.
* Restoring a snapshot can reapply multiple controls even when only one value changed.

## Considered Alternatives

### Command or Per-Control Delta History

Recording only individual commands or deltas would reduce duplicate data, but each action source would need its own inverse implementation.
This increases the risk that preset loads, imports, and compound actions restore only part of the application state.

### Separate History Storage and IndexedDB Migration

A dedicated history store could isolate data, but introduces a migration and additional failure modes.
Embedding an optional history field in the existing last-session record retains compatibility with legacy records and permits safe fallback.

### Reset All That Clears History

Clearing history would make Reset All irreversible and could destroy a user’s work.
Treating it as an ordinary snapshot transition gives users a safe path back.

## Links

* [History and Default Settings](../history-and-default-settings.md)
* [ADR 0002: Modular ES Source Architecture](./0002-modular-es-source-architecture.md)
* [Session Manager](../../src/storage/session-manager.js)
* [Settings History](../../src/core/settings-history.js)
* [Settings Manager](../../src/storage/settings-manager.js)

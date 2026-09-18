# 0009. Versioned Offline Audio Export Metadata

* Status: accepted
* Deciders: rapjul, Codex
* Date: 2026-09-13

## Context and Problem Statement

A rendered audio file alone cannot reveal the sound design, export mode, timing, or random pattern material used to make it. A settings snapshot is necessary for a future upload-and-restore workflow, but settings alone do not reproduce a random direction unless the normalized seed and materialized sequence are preserved as well.

The metadata must survive ordinary file movement, be understandable by audio tools where practical, and leave WAV PCM and MP3 gapless information intact. It must also evolve without causing a future importer to guess at an unknown layout.

## Decision Drivers

* Preserve sufficient offline-export information to validate and eventually restore a loop.
* Keep the record consistent between WAV and MP3.
* Use established audio-container metadata where available while retaining a complete app record.
* Define compatibility behavior before an import UI exists.

## Decision Outcome

Each offline WAV and MP3 export receives one immutable UTF-8 JSON record created from the export settings snapshot and resolved render result. Its stable envelope uses schema `web-arpeggiator.offline-export` and numeric version `1`.

The record includes the complete normalized settings serialization, including `randomSeed`; the flattened materialized scheduled note sequence across every selected cycle; its `stepsPerCycle` and `cycleCount`; and render details: export mode, loop count, musical/pre-roll/tail/render durations, sample rate, channel count, and output frame count. Capturing both the seed and rendered sequence makes randomized exports inspectable and provides a future importer with a concrete comparison target.

WAV writes human-readable `LIST/INFO` tags plus the full record in a private `arpg` RIFF chunk before `data`; the PCM payload and its frame count remain unchanged. MP3 writes standard ID3v2.4 title and software tags plus the full record in a `TXXX` frame named `WEB_ARPEGGIATOR_EXPORT`; the tag precedes MPEG frames so the Info/LAME gapless frame remains available.

Only offline exports carry this record. Real-time recordings intentionally omit it because their settings can change while recording and one snapshot would be misleading. Missing metadata is valid for legacy files. A future importer must validate the schema and version, normalize supported settings through the settings loader, preserve the resolved sequence for comparison, and reject unsupported newer versions without replacing the current project.

### Positive Consequences

* Exported loops retain a durable, inspectable creation record.
* WAV and MP3 share one app-level schema while using native container conventions.
* Future import can restore validated settings instead of attempting audio analysis.
* Versioning provides an explicit path for compatible migrations.

### Negative Consequences

* Files contain a larger metadata payload and duplicated discovery text.
* The metadata is application-specific and unsupported audio players may ignore it.
* Each future schema change requires migration, reader, writer, and importer coverage.

## Links

* [Audio Export Metadata](../audio-export-metadata.md)
* [ADR 0008: Seamless WAV Export Invariants](./0008-seamless-wav-export-invariants.md)
* [ADR 0006: Persistent Settings, History, and Default Resets](./0006-persistent-settings-history-and-default-resets.md)
* [ADR 0015: Shared 480-PPQ Musical Timeline Contract](./0015-shared-480-ppq-musical-timeline-contract.md)
* [ADR 0016: Reproducible Stochastic Pattern Semantics](./0016-reproducible-stochastic-pattern-semantics.md)

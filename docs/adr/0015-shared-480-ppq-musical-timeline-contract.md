---
status: accepted
date: 2026-09-18
decision-makers: [rapjul, Codex]
consulted: []
informed: []
---

# Use a Shared 480-PPQ Musical Timeline as the Cross-Output Timing Contract

## Context and Problem Statement

Live playback, static loop previews, offline audio export, duration estimates, and Standard MIDI export had separate timing paths. Those paths could disagree about a pattern's resolved notes, swing offsets, gates, source-step mapping, and final event boundary. A correction in one output could therefore leave another output musically different.

The application needs one pure, inspectable timing contract that works without a live audio context, preserves the existing Tone transport lifecycle, and represents every supported subdivision exactly.

## Decision Drivers

- Keep every output musically consistent for the same settings.
- Express timing without accumulated floating-point error.
- Prevent a gate from extending past a later actual attack.
- Keep public export limits distinct from internal render work such as seamless warm-up.
- Make timing rules independently testable without browser audio rendering.

## Considered Options

- Compile one integer-tick timeline consumed by every musical output.
- Leave Tone.Transport as the timing source and adapt each exporter separately.
- Share only a resolved note sequence while allowing each output to calculate swing and gates.
- Render audio first and derive MIDI or previews from the rendered result.

## Decision Outcome

Chosen option: "Compile one integer-tick timeline consumed by every musical output," because a shared event contract prevents timing drift while preserving focused live, offline, and MIDI adapters.

`src/core/timeline.js` is the canonical source for normalized musical timing. It uses 480 ticks per quarter note, materializes the requested finite event range, and returns absolute event starts, effective gate durations, source-note mappings, cycle and step indexes, and the normalized settings needed by consumers.

The compiler applies swing to absolute event starts. Consumers that schedule compiled events must not apply Tone transport swing a second time. Each non-terminal gate is bounded by the next actual compiled attack, not by an assumed unswung interval. Callers choose an explicit terminal-gate policy: clip at the selected musical boundary for seamless loops, or preserve the final release for effects-tail exports.

The public export range remains 1–100 cycles. Internal render work can request the additional cycles needed for seamless warm-up without changing that user-facing limit. Every consumer derives timing from a compiled timeline rather than independently calculating swing, gate, or event-boundary behavior.

### Consequences

- Good, because playback, previews, offline audio, and MIDI describe the same musical event sequence.
- Good, because edge cases such as full swing, fine subdivisions, empty patterns, and cycle boundaries have one testable implementation.
- Good, because MIDI can serialize exact integer event timing without approximating browser scheduling.
- Bad, because timeline changes require cross-output regression coverage rather than a local consumer-only test.
- Neutral, because live playback still adapts compiled events to Tone.Pattern to retain the established transport lifecycle.

### Confirmation

Unit tests cover interval resolution, BPM bounds, swing ordering, gate clipping, terminal-release preservation, empty patterns, cycle boundaries, and MIDI timing. Browser tests confirm the public playback and export workflows continue to operate through the same contract.

## More Information

- [Architecture: Shared Musical Timeline](../architecture.md#shared-musical-timeline)
- [ADR 0008: Seamless WAV Export Invariants](./0008-seamless-wav-export-invariants.md)
- [ADR 0009: Versioned Offline Audio Export Metadata](./0009-versioned-offline-audio-export-metadata.md)
- [ADR 0016: Reproducible Stochastic Pattern Semantics](./0016-reproducible-stochastic-pattern-semantics.md)

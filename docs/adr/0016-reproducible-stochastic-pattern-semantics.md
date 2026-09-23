---
status: accepted
date: 2026-09-18
decision-makers: [rapjul, Codex]
consulted: []
informed: []
---

# Make Stochastic Pattern Directions Seeded and Reproducible

## Context and Problem Statement

Independent use of ambient randomness lets live playback, loop previews, offline audio, and MIDI materialize different notes for the same visible settings. It also makes a rendered file's metadata unable to prove which random material was heard.

The application exposes stochastic directions as musical tools, not incidental noise. Their names, cycle behavior, continuation rules, reshuffling, and persisted state must remain stable across settings restoration and every export format.

## Decision Drivers

- Preserve one recognizable musical result for a given settings snapshot.
- Give users an explicit way to choose a different random result.
- Define user-facing behavior for every stochastic direction.
- Preserve enough information to reproduce and validate exported material.
- Avoid changing a random stream merely because a different output consumer compiles it.

## Considered Options

- Use a persisted unsigned seed and deterministic cursor for every stochastic direction.
- Use `Math.random()` independently in each output consumer.
- Randomize once when a direction is selected and repeat that fixed sequence forever.
- Preserve only the materialized export notes without storing the seed.

## Decision Outcome

Chosen option: "Use a persisted unsigned seed and deterministic cursor for every stochastic direction," because it keeps behavior repeatable while retaining a deliberate reshuffle action.

`randomSeed` is a normalized unsigned 32-bit setting with a stable default. It is serialized through presets, sessions, history, shared URLs, and offline-export settings metadata. The deterministic cursor in `src/core/pattern-core.js` is the only supported stochastic sequence source for the timeline.

The directions have these stable semantics:

- **Random Step** selects one seeded random resolved note independently for each step; repeats are allowed.
- **Random Cycle** plays every resolved note once in a seeded shuffled order, then obtains a new seeded shuffle for the next cycle.
- **Random Walk** retains its seeded adjacent-note position across cycle boundaries.
- **Drunkard's Walk** retains that continuous state and occasionally makes reflected two- or three-note leaps.

Reshuffle Pattern is the only user action that chooses a new seed. A compiled timeline materializes the exact finite `scheduledNotes` it will consume. Offline audio metadata preserves the full multi-cycle rendered sequence in `pattern.renderedNotes` alongside the legacy single-cycle sequence in `pattern.scheduledNotes` and the seed in `settings.randomSeed`; MIDI stores the seed in a sequencer-specific meta event while retaining self-contained note events for standard players.

### Consequences

- Good, because reopening a settings snapshot or exporting through another output preserves the intended random result.
- Good, because Random Step and Random Cycle communicate distinct musical expectations.
- Good, because materialized notes provide an independent verification target alongside the seed.
- Bad, because changes to the pseudo-random generator or direction semantics require an explicit migration and compatibility decision.
- Neutral, because unrelated features may still use nondeterministic randomness when they do not produce a persisted pattern stream.

### Confirmation

Unit tests verify same-seed reproducibility, different-cycle materialization, one-note-per-cycle Random Cycle output, continuous walk state, reshuffling controls, persisted seed normalization, export metadata, and MIDI sequencer metadata. Browser tests verify direction controls, shared-preset restoration, and exported pattern behavior.

## More Information

- [Pattern Directions](../pattern-directions.md)
- [ADR 0015: Shared 480-PPQ Musical Timeline Contract](./0015-shared-480-ppq-musical-timeline-contract.md)
- [ADR 0014: Versioned Settings Snapshot Compatibility](./0014-versioned-settings-snapshot-compatibility.md)
- [ADR 0009: Versioned Offline Audio Export Metadata](./0009-versioned-offline-audio-export-metadata.md)

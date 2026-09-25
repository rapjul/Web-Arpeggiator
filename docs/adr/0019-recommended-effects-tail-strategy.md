---
status: accepted
date: 2026-09-17
decision-makers: [rapjul, Codex]
consulted: []
informed: []
---

# Recommend Effects-Tail Durations from the Rendered Source Boundary

## Context and Problem Statement

Include effects tail previously used a fixed two-second default. That can truncate long releases or feedback effects, while a longer fixed value wastes export time for dry sounds. The recommendation must also describe the audio that the renderer actually produces: a swung terminal gate may release after the nominal pattern boundary, and `PluckSynth` has a fixed physical-model release rather than the shared ADSR release control.

## Decision Drivers

- Give beginners a useful result without requiring audio-engine knowledge.
- Preserve a deterministic Custom duration for users who need it.
- Keep legacy settings and exports reproducible.
- Keep the UI estimate, filename, metadata, and offline renderer aligned.

## Considered Options

- Calculate Auto tails from the effective synth release and active decaying effects after the final release trigger.
- Keep a fixed default tail for every synth and effect configuration.
- Start the tail at the nominal pattern boundary even when the final gate extends beyond it.
- Apply the ADSR release slider to `PluckSynth` despite its physical-model release behavior.

## Decision Outcome

Chosen option: "Calculate Auto tails from the effective synth release and active decaying effects after the final release trigger," because it preserves the final scheduled note and gives the entire recommended tail to its release and effects.

Include effects tail exposes **Auto (recommended)** and **Custom** strategies. Auto combines the effective synth release with settling time for active Delay, Reverb, and Chorus, excludes Auto-pan because it does not add decaying energy, and caps the result at ten seconds. `PluckSynth` explicitly uses its one-second physical-model release for both live and offline synthesis and Auto estimation. Custom uses the normalized zero-to-ten-second field.

The shared timeline provides the final release trigger. Tail renders begin after whichever is later: the selected pattern boundary or that terminal trigger. The duration preview and offline renderer call the same duration calculation, and Auto filenames record the rounded effective duration in conventional seconds notation, such as `tail-auto-4.5s`. Export metadata retains the actual render timing.

New settings default to Auto. A snapshot without this field is legacy and restores as Custom with its existing two-second value. URLs may specify a valid strategy; invalid or older URLs retain the current strategy.

### Consequences

- Good, because a preserved swung final gate cannot shorten the advertised tail.
- Good, because `PluckSynth` output has a truthful decay estimate.
- Good, because users can identify Auto-rendered output from its filename without losing a conventional duration notation.
- Bad, because tail estimates update when relevant synthesis and effect controls change.
- Neutral, because legacy snapshots keep their prior deterministic duration.

### Confirmation

Unit tests cover Auto and Custom normalization, legacy restoration, malformed URLs, reachable capping, synth-specific release behavior, terminal-gate overhang, filename generation, and exact estimate copy. Browser tests cover control updates, persistence, and rendered export behavior.

## More Information

- [ADR 0008: Seamless WAV Export Invariants](./0008-seamless-wav-export-invariants.md)
- [ADR 0015: Shared 480-PPQ Musical Timeline Contract](./0015-shared-480-ppq-musical-timeline-contract.md)
- [ADR 0009: Versioned Offline Audio Export Metadata](./0009-versioned-offline-audio-export-metadata.md)
- [Audio Export Metadata](../audio-export-metadata.md)

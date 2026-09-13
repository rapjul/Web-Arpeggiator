# 0008. Seamless WAV Export Invariants

* Status: accepted
* Deciders: rapjul, Codex
* Date: 2026-09-13

## Context and Problem Statement

An offline arpeggiator render begins with a silent synth and effects chain. Cutting that cold-start render to the requested musical duration makes the boundary sound unsettled when it repeats, particularly with releases, feedback delay, and reverb. At the same time, a WAV described as a seamless loop must not gain or lose frames, or have its cropped PCM changed by a fade or boundary blend.

A short crossfade was considered as a way to disguise a discontinuity. It changes the end of the rendered loop, however, and can make a loop that was already sample-exact no longer repeat faithfully. MP3 encoders and players can also add or honor delay and padding differently, so an MP3 cannot make the same byte-level promise.

## Decision Drivers

* Produce WAV loops with exactly the user-selected musical duration and pattern-cycle count.
* Establish the steady-state envelope and effects signal without altering the exported PCM.
* Keep the conventional cold-start effects-tail export available.
* State a guarantee that can be verified independently of browser audio rendering.

## Decision Outcome

For **Seamless loop**, the renderer repeats the source by whole pattern cycles before the selected export region. The warm-up duration accounts for the synth release, enabled eighth-note feedback delay settling to approximately -60 dB, and enabled reverb decay. The export boundary remains cycle-aligned.

Before rendering, the exporter derives the crop start, output frame count, and required source length from one integer-frame timeline. It requests one non-exported guard frame and rejects a renderer result that is shorter than the complete crop window. After rendering, it copies exactly `round(musicalDurationSeconds * sampleRate)` frames from that boundary for every channel. It does not apply a crossfade, fade, resampling step, padding frame, or other post-crop PCM modification. The result therefore has exactly the requested integer number of pattern cycles when the requested musical duration does.

Chorus and Auto-pan are time-varying effects. Seamless mode warms chorus’s short delay and auto-pan’s modulation stage, then checks whether every active LFO completes a whole number of phases across the selected musical duration. If it does not, the exporter rejects seamless mode with guidance to adjust Pattern cycles, disable the effect, or select Include effects tail. It never silently bypasses or retimes an enabled modulation effect.

For **Include effects tail**, the renderer retains its cold start and appends the selected 0–10 second tail. It has no warm-up crop or boundary treatment.

The sample-exact seamless-loop guarantee applies only to WAV. MP3 receives the same prepared source material and gapless delay/padding metadata where supported, but lossy encoding and player behavior prevent an equivalent guarantee.

Tests must cover the pure timing and crop calculations, then encode a deterministic multi-channel PCM fixture to WAV. The decoded payload must have the expected RIFF frame count, exact per-channel samples, and exactly the requested number of cycles. Browser offline-rendering tests additionally exercise effect warm-up and scheduling, but do not substitute engine-dependent audio comparisons for the binary invariant.

### Positive Consequences

* A seamless WAV has a small, precise, testable contract.
* Effects are already active at the loop boundary without a destructive boundary blend.
* Users can choose a tail export when a cold attack and decay are preferable.
* Regression tests detect added, dropped, or changed PCM frames.

### Negative Consequences

* Long release and feedback settings can increase offline render work before cropping.
* Natural sound continuity still depends on the selected musical material and effects settings.
* MP3 exports must communicate their compatibility limitation rather than claim exact loops.

## Links

* [Audio Export Metadata](../audio-export-metadata.md)
* [ADR 0002: Modular ES Source Architecture](./0002-modular-es-source-architecture.md)
* [ADR 0009: Versioned Offline Audio Export Metadata](./0009-versioned-offline-audio-export-metadata.md)

# 0015. Recommended Effects-Tail Strategy

* Status: accepted
* Deciders: rapjul, Codex
* Date: 2026-09-17

## Context and Problem Statement

The Include effects tail export mode previously exposed a fixed default of two seconds. That value is safe for many presets but can truncate a long synth release or feedback effect, while a long fixed tail wastes time for dry or quickly settling sounds. Users should not need to estimate the decay time of every active effect before exporting.

## Decision Drivers

* Give beginners a useful result without requiring audio-engine knowledge.
* Preserve an explicit duration for users who need deterministic custom output.
* Keep existing saved settings and exports compatible.
* Use the same duration calculation for the UI estimate and the offline renderer.

## Decision Outcome

Add an **Auto (recommended)** and **Custom** strategy under Include effects tail. Auto calculates the synth release plus settling time for active delay, reverb, and chorus effects, intentionally excluding auto-pan because modulation does not add decaying energy. The recommendation is capped at the existing 10-second export limit. Custom uses the normalized 0–10 second field.

The default settings use Auto. A settings snapshot that predates this field is treated as legacy and uses Custom with the existing 2-second default. URL presets may include the tail strategy explicitly; older URLs retain the current settings value. The UI disables the custom seconds field while Auto is selected and shows the calculated strategy in the duration estimate.

Both the duration preview and `src/audio/recorder.js` call `calculateOfflineExportDuration`, so the displayed estimate and rendered tail use the same normalized value. The actual tail duration remains part of offline export metadata.

## Consequences

* New users receive a context-sensitive tail without changing effect settings.
* Experienced users retain exact custom-tail control.
* Legacy settings remain reproducible instead of silently changing their export length.
* Automatic tails can be shorter or longer than two seconds, up to the ten-second safety cap.

## Links

* [ADR 0008: Seamless WAV Export Invariants](./0008-seamless-wav-export-invariants.md)
* [Audio Export Metadata](../audio-export-metadata.md)

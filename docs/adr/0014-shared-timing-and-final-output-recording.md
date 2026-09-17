---
status: accepted
date: 2026-09-17
decision-makers: [rapjul, Codex]
consulted: []
informed: []
---

# Use One Musical Timeline and Record the Final Output

## Context and Problem Statement

Live playback, visual timing, offline audio, and MIDI export must describe the same musical events. Previously, each output boundary could derive interval timing, gate length, swing, and note ordering independently. Real-time recording also tapped the reverb output before post-gain and limiting, and it started capture after automatic playback began, which could omit the first note or produce a file that did not match the monitored sound.

## Decision Drivers

* Keep musical timing independent of Tone.js and the DOM.
* Preserve one exact event sequence across playback, previews, audio exports, and MIDI.
* Capture the sound the user actually monitors, including master volume and limiting.
* Keep browser-recorded media retryable when decoding or format conversion fails.
* Preserve the existing lazy audio startup and recorder fallback behavior.

## Considered Options

* Compile one pure 480-PPQ timeline and adapt it at each output boundary.
* Keep independent scheduling logic in Tone playback, offline rendering, and MIDI export.
* Record before the effects chain or before post-gain and limiting.

## Decision Outcome

Chosen option: compile one pure timeline in `src/core/timeline.js`, then consume its absolute event ticks in live playback, loop previews, offline audio, and MIDI export. The compiler materializes pattern direction, octave expansion, scale quantization, and randomness before assigning event positions. It applies swing once, retains complete musical duration, preserves source identity, and bounds releases before the next event.

The live adapter uses `Tone.Pattern` for the existing transport lifecycle but schedules gates and compiled swing offsets from timeline events. Offline audio and MIDI consume the absolute events directly. Consumers disable Tone transport swing when the compiler has already applied it.

The audio engine exposes `recordingOutput`, which is the limiter output after post-gain when the limiter is available, or post-gain as the safe fallback. Both `Tone.Recorder` and `MediaRecorder` connect to that final monitored signal. Capture starts before automatic playback when recording begins from a stopped transport. Export decodes the raw browser recording into one `AudioBuffer`, converts that PCM buffer to WAV and/or MP3, and retains the raw blob and decoded buffer for retries.

### Consequences

* Good, because all musical outputs share integer tick timing and source-note identity.
* Good, because a recording includes master volume, limiting, and the first playback event.
* Good, because WAV downloads are generated from decoded PCM instead of being mislabeled browser media.
* Good, because a failed conversion does not discard the source recording.
* Bad, because timing changes must update the compiler contract and its consumers together.
* Neutral, because the existing Tone and MediaRecorder fallbacks remain available.

## Confirmation

Unit tests compare generated MIDI note events with compiled absolute ticks, verify the final recording tap, confirm capture-before-playback ordering, and assert one decode is reused for multiple export formats. The project validation workflow remains `bun run test:unit`, `bun run test:coverage`, `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run build`, and `bun run test:e2e`.

## More Information

* [Architecture Guide](../architecture.md)
* [MIDI Specification & Implementation Reference](../midi-specification.md)
* [Development and Testing](../development.md)

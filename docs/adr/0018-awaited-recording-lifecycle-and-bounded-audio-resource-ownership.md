---
status: accepted
date: 2026-09-19
decision-makers: [rapjul, Codex]
consulted: []
informed: []
---

# Awaited Recording Lifecycle and Bounded Audio Resource Ownership

## Context and Problem Statement

Real-time capture joins asynchronous recorder backends, transport playback, browser media streams, and export conversion. Starting transport before the selected recorder confirms readiness can omit the first musical event. Failure during cleanup can hide the original playback failure and leave recording controls stale. Retaining decoded PCM after every successful export also keeps large in-memory audio buffers alive for the browser session.

## Decision Drivers

- Preserve the first audible scheduled event in a real-time recording.
- Give each recording transition one observable owner and one terminal UI state.
- Preserve the primary failure while treating cleanup failures as diagnostics.
- Permit conversion retries without retaining successful-export PCM indefinitely.
- Release audio graph and browser media resources before the engine is disposed.

## Considered Options

- Await backend readiness and use explicit recording phases with bounded ownership.
- Start recording and playback concurrently, relying on scheduler timing.
- Keep decoded recording data for the application lifetime.
- Let each backend expose separate event-driven UI transitions.

## Decision Outcome

Chosen option: "Await backend readiness and use explicit recording phases with bounded ownership," because capture correctness and teardown require one lifecycle contract independent of the selected backend.

`RecorderManager` owns `idle`, `starting`, `recording`, `stopping`, and `destroyed` phases. It awaits
`Tone.Recorder.start()` and native `MediaRecorder`'s `start` event before it publishes recording
state or requests transport playback. It rejects competing transitions, tracks active transition and
export promises, and ignores late backend events after destruction. Real-time exports lock recording
controls (`isExporting`) and snapshot the active take and decoded buffer to prevent concurrent
mutation. Destruction waits for an active real-time export to complete before releasing
runtime-owned resources, while the export suppresses UI updates after destruction begins.

All start and stop paths observe synchronous exceptions, rejected promises, and native error events. Mid-capture `MediaRecorder.onerror` events abort the take, restore idle state, and notify the user rather than falsely publishing export readiness. If playback fails after capture starts, cleanup is attempted in a guarded path, the original playback error remains the rejected error, and UI recovery always runs without claiming uncaptured takes are exportable. A valid blob from that cleanup remains exportable.

The raw recorded blob remains available until a replacement take or teardown. Decoded PCM is retained
only when a WAV or MP3 conversion fails, allowing a retry without a redundant decode; a successful
export, new blob, or teardown releases it. `destroy()` awaits in-flight start or stop transitions and
active real-time exports, stops active capture, disconnects graph targets, disposes Tone recorders,
stops native stream tracks, clears handlers and chunks, and drops retained blobs and buffers. The
runtime controller waits for in-flight audio startup before disposal and queues new `startAudio()`
requests until teardown completes. Runtime teardown awaits recorder cleanup before disposing the
audio engine.

### Consequences

- Good, because recording begins only after capture is demonstrably ready.
- Good, because in-flight transitions serialize cleanly with teardown without orphaned promises or duplicate stops.
- Good, because asynchronous backend errors contain failure without advertising corrupt takes.
- Good, because active exports are isolated from new recording takes.
- Good, because an already-started export can finish before teardown releases its dependencies.
- Good, because startup cannot report success for a runtime that teardown is about to dispose.
- Good, because UI recovery cannot accidentally replace the primary operational failure.
- Good, because long decoded recordings do not survive successful export unnecessarily.
- Bad, because recorder clients must await lifecycle operations and teardown.
- Neutral, because raw recording data remains intentionally reusable until replacement or teardown.

### Confirmation

Unit tests exercise deferred and rejected starts, stop and playback cleanup failures, native fallback
events, transition reentrancy, late events, retry-cache release, export completion during teardown,
runtime restart during teardown, and recorder teardown. Browser tests fail on page errors or
unhandled rejections and inspect real WAV/MP3 artifacts rather than only their container headers.

## More Information

- [ADR 0005: Defer Tone Runtime Until Audio Activation](./0005-defer-tone-runtime-until-audio-activation.md)
- [ADR 0011: Playwright Browser Testing](./0011-playwright-browser-testing.md)
- [ADR 0012: Observable Playwright Synchronization and Artifact Validation](./0012-observable-playwright-synchronization-and-artifact-validation.md)
- [Architecture: Audio](../architecture.md#audio)

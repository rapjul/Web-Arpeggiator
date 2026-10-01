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

`RecorderManager` owns `idle`, `starting`, `recording`, `stopping`, and `destroyed` phases. It awaits `Tone.Recorder.start()` and native `MediaRecorder`'s `start` event before it publishes capture readiness or permits transport scheduling. Playback waits on the dedicated `awaitCaptureReady()` barrier, which resolves before recording startup can request auto-playback; awaiting the full recording transition from playback would create a circular wait when the user starts both together. `awaitPendingTransition()` remains available to callers that need the complete transition. Concurrent stop callers share one backend stop and its outcome. A stop failure remains a rejection even if recovery has reset the visible recording phase to idle. Real-time exports lock recording controls (`isExporting`) and snapshot the active take and decoded buffer to prevent concurrent mutation. Destruction waits for an in-progress backend start and active real-time export before releasing runtime-owned resources, while allowing pending audio activation to finish without constructing a recorder after destruction. The recording transition suppresses late UI updates after destruction begins.

All start and stop paths observe synchronous exceptions, rejected promises, and native error events. Mid-capture `MediaRecorder.onerror` events abort the take, restore idle state, and notify the user rather than falsely publishing export readiness. If playback fails after capture starts, cleanup is attempted in a guarded path, the original playback error remains the rejected error, and UI recovery always runs without claiming uncaptured takes are exportable. A valid blob from that cleanup remains exportable.

The raw recorded blob remains available until a replacement take or teardown. Decoded PCM is retained only when a WAV or MP3 conversion fails, allowing a retry without a redundant decode; a successful export, new blob, or teardown releases it. `destroy()` waits for an in-progress backend start, active stop, and real-time export, then stops any remaining capture, disconnects graph targets, disposes Tone recorders, stops native stream tracks, clears handlers and chunks, and drops retained blobs and buffers. It does not wait for unrelated playback startup after capture is ready: the recording transition checks the destroyed state before resuming UI work. The runtime controller waits for in-flight audio startup before disposal and queues new `startAudio()` requests until teardown completes. Runtime teardown awaits recorder cleanup before disposing the audio engine.

Awaiting backend readiness is scoped to the capture lifecycle. Normal transport playback does not block on recorder pre-warming; it only waits for the dedicated capture-ready barrier when a user has already started recording. Deferred tests exercise concurrent Play, Record, and stop requests so playback can begin after capture is ready without waiting for the recording transition to finish.

### Consequences

- Good, because recording begins only after capture is demonstrably ready.
- Good, because playback without an in-progress capture avoids recorder pre-warming, while coordinated playback waits only for capture readiness.
- Good, because playback and recording startup cannot wait on each other, and concurrent stop requests share one outcome.
- Good, because destruction during activation cannot create a late recorder, and active capture stops before its resources are released.
- Good, because asynchronous backend errors contain failure without advertising corrupt takes.
- Good, because active exports are isolated from new recording takes.
- Good, because an already-started export can finish before teardown releases its dependencies.
- Good, because startup cannot report success for a runtime that teardown is about to dispose.
- Good, because UI recovery cannot accidentally replace the primary operational failure.
- Good, because long decoded recordings do not survive successful export unnecessarily.
- Bad, because recorder clients must await lifecycle operations and teardown.
- Neutral, because raw recording data remains intentionally reusable until replacement or teardown.

### Confirmation

Unit tests exercise deferred and rejected starts, concurrent playback and capture readiness, shared stop success and failure, native fallback events, late events, retry-cache release, export completion during teardown, runtime restart during teardown, and recorder teardown. Browser tests fail on page errors or unhandled rejections and inspect downloaded PCM audio for valid samples, audible output, and expected duration.

## More Information

- [ADR 0005: Defer Tone Runtime Until Audio Activation](./0005-defer-tone-runtime-until-audio-activation.md)
- [ADR 0011: Playwright Browser Testing](./0011-playwright-browser-testing.md)
- [ADR 0012: Observable Playwright Synchronization and Artifact Validation](./0012-observable-playwright-synchronization-and-artifact-validation.md)
- [Architecture: Audio](../architecture.md#audio)

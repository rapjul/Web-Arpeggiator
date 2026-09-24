---
status: accepted
date: 2026-09-24
decision-makers: [rapjul, Antigravity]
consulted: []
informed: []
---

# 0020. Bounded Audio Startup Latency and Lifecycle Benchmarking

## Context and Problem Statement

Web audio applications face strict browser autoplay policies requiring an initial user gesture before an `AudioContext` can transition to the `running` state. In Web Arpeggiator, [ADR 0005](./0005-defer-tone-runtime-until-audio-activation.md) established deferred loading of `Tone.js` and audio engine creation until that first interaction. However, as synthesis models, effects chains, recording backends, visualizers, and settings persistence grew, audio startup accumulated multiple sequential asynchronous operations: dynamic module loading, `AudioContext` resumption, audio graph wiring, settings snapshot application, recorder backend initialization, and transport scheduling.

In PR #67 (`fix/final-output-recording`), an inadvertent change awaited `recorderManager.initRecorder()` inside the transport startup sequence. Because `Tone.Recorder` and `MediaRecorder` backend initialization requires stream negotiation and fallback probing, this introduced a multi-second silent gap between the user clicking "Start Audio" and the first audible note sounding. Furthermore, previous logging relied on informal `console.log` statements placed when `Tone.Transport.start()` was invoked, which did not reflect the true onset of audible sound when the first note event actually scheduled and triggered the step indicator.

Even after unblocking auxiliary recorder pre-warming, profiling revealed a second, deeper source of latency: whenever a user spent dwell time on the page before initiating playback (such as reading the interface for several seconds), cold start exhibited a consistent 6–7.5 second silent lag before the first note sounded, whereas warm restart was instantaneous (< 100ms). Investigation into `Tone.js v15` revealed that `Tone.Transport` and `Tone.TickSource` initialize tick references at time 0 (`setTicksAtTime(0, 0)`). Calling `Tone.Transport.start()` without an explicit timeline offset (`undefined`) executed `TickSource.start(computedTime, undefined)` without resetting ticks to zero. If seconds had elapsed since tab creation, `TickSource.getTicksAtTime(computedTime)` computed that thousands of ticks had elapsed, causing `TransportRepeatEvent` to delay scheduling `_nextTick` until the next interval boundary far in the future. Warm restart avoided this because `Tone.Transport.stop()` explicitly executes `setTicksAtTime(0, computedTime)`, inadvertently providing the reset that cold start lacked.

We need an enforced architectural latency contract that bounds cold-start and warm-restart durations, decouples auxiliary background tasks from playback onset, provides explicit timeline zero-offset synchronization on transport start, provides high-resolution standardized telemetry via the Web Performance API, and guards against performance regressions with automated benchmarks across both immediate and idle dwell scenarios.

## Decision Drivers

- Guarantee instant or near-instant audio feedback upon user interaction (< 2500ms cold start in headless `CI`, < 800ms on desktop hardware, and < 300ms for warm restarts).
- Prevent auxiliary services (such as real-time audio recorders, inactive synths, or offline renderers) from blocking or delaying transport playback.
- Synchronize playback onset telemetry with the first audible musical step rather than transport activation commands.
- Standardize lifecycle timing metrics using the browser-native Web Performance API (`performance.mark` and `performance.measure`) without runtime overhead or test runner noise.
- Validate startup latency thresholds automatically in continuous integration via `Playwright` E2E scenarios and `Vitest` subsystem benchmarks.

## Considered Options

- **Option 1: Eagerly await all audio subsystems synchronously during startup**: Block playback until `Tone.Recorder`, `MediaRecorder`, all three synthesizer types, and reverb impulse responses are fully instantiated and ready.
- **Option 2: Ad-hoc console logging and manual ear verification**: Rely on developer `console.log` statements and manual testing to detect startup latency regressions.
- **Option 3: Decoupled asynchronous pre-warming with Performance API waterfall telemetry and automated E2E latency budgets**: Start transport and schedule the first note immediately while pre-warming recorder backends asynchronously in the background (`void recorderManager.initRecorder()`); record granular performance marks across lifecycle phases; compute structured waterfall measures; and enforce cold-start and warm-restart latency budgets via automated `Playwright` and `Vitest` test suites.

## Decision Outcome

Chosen option: **Option 3 (Decoupled asynchronous pre-warming with Performance API waterfall telemetry and automated E2E latency budgets)**.

### 1. Decoupled Asynchronous Pre-warming Contract
Playback onset is strictly decoupled from capture readiness:
- [ADR 0018](./0018-awaited-recording-lifecycle-and-bounded-audio-resource-ownership.md) mandates awaiting backend readiness *only* when the user explicitly begins a real-time recording take (`startRealtimeCapture`).
- For normal playback (`startAudio` and `playbackController.start`), the recorder backend is triggered via background pre-warming (`void recorderManager.initRecorder()`), ensuring transport scheduling and synth attack are never held hostage by media stream allocation or recorder fallback probing.

### 2. Explicit Timeline Zero-Offset Synchronization
To prevent `Tone.Transport` and `Tone.TickSource` from scheduling events against stale elapsed ticks:
- [`src/audio/playback-controller.js`](../../src/audio/playback-controller.js) explicitly resets `transport.position = 0` prior to starting and upon stopping.
- Playback initiation calls `transport.start(undefined, 0)`, explicitly supplying timeline offset `0` to force `TickSource.setTicksAtTime(0, computedTime)`. This resets the reference tick timeline so tick 0 fires immediately, eliminating the 6–7.5 second scheduling delay regardless of how long the page sat idle prior to user interaction.
- [`src/audio/runtime-controller.js`](../../src/audio/runtime-controller.js) safely resets `initialTransport.position = 0` during audio engine initialization.

### 3. High-Resolution Local Startup Profiling and Hybrid Privacy Guard
The core module [`src/core/startup-profiler.js`](../../src/core/startup-profiler.js) manages standard microsecond-accurate Web Performance API markers across audio initialization:
- `audio:user-start-gesture`: Moment the user clicks "Start Audio", "Start and Enable Audio", or a sound starter card.
- `audio:modules-loading` / `audio:modules-loaded`: Dynamic ES module importing of `Tone.js` and audio submodules.
- `audio:context-resuming` / `audio:context-resumed`: Asynchronous `Tone.start()` / `AudioContext.resume()` execution.
- `audio:engine-creating` / `audio:engine-created`: Graph construction of synths, effects chain, limiter, and analyser.
- `audio:settings-applying` / `audio:settings-applied`: Settings snapshot hydration and parameter synchronization.
- `audio:transport-starting`: Scheduler kickoff and `Tone.Transport.start()`.
- `audio:first-step-executed`: First note step processed and audible, synchronizing with the first active step pip indicator.

To preserve user privacy and prevent tracking concerns, profiling is strictly local (zero network calls, zero analytics). It runs during development (`import.meta.env.DEV`) and automated tests (`import.meta.env.MODE === "test"`). In production, it is completely inactive by default, but can be enabled on-demand for field debugging via `?perf=true` or `?debug=true` in the URL query string.

In Vite development mode, `logStartupWaterfall()` outputs a structured diagnostic table (`console.table`) detailing the millisecond duration of each phase.

### 4. Latency Budgets & Automated Verification
- **Immediate Cold Start Budget**: Under **2500ms** in headless browser `CI` (typically 400–800ms on desktop hardware) when triggering playback immediately upon page load (such as clicking "Start and Enable Audio" on `#start-overlay`). Verified by `tests/e2e/playback-startup-latency.test.ts`.
- **Dwell Time Cold Start Budget**: Under **2500ms** total wall-clock and under **500ms** from transport start to first note when initiating playback after idle page dwell time (such as 3+ seconds of reading before clicking "Start Audio"). Verified by `tests/e2e/playback-startup-latency.test.ts`.
- **Transport-to-First-Note Phase Budget**: Under **150ms** (`audio:transport-to-first-note`) across both immediate and idle dwell starts, ensuring the scheduler processes tick 0 without boundary skip delay.
- **Warm Restart Budget**: Under **300ms** from clicking "Restart Audio" until the first step pip activates. Verified by `tests/e2e/playback-startup-latency.test.ts`.
- **Concurrent Capture Non-Interference**: Background recorder pre-warming executes concurrently without delaying playback onset, verified by headless recorder concurrency tests in `tests/e2e/playback-startup-latency.test.ts`.
- **Subsystem Algorithmic Budgets**: Pure domain computations (100-cycle 480-PPQ timeline compilation < 100ms, 500 settings snapshot mergers < 100ms, profiler overhead < 0.1ms per cycle). Verified by `tests/perf/audio-startup-benchmarks.test.ts`.

### Consequences

- Good, because users experience immediate musical response when interacting with the app.
- Good, because explicit timeline zero-offset synchronization guarantees that cold start is completely immune to page dwell time and tick desynchronization drift.
- Good, because background pre-warming guarantees that real-time recording remains ready without penalizing transport latency.
- Good, because granular Performance API measures enable instant debugging of any startup bottleneck in Chrome DevTools without code edits.
- Good, because the hybrid privacy guard guarantees zero overhead and zero tracking in production by default while allowing real-device debugging with `?perf=true`.
- Good, because regressions like PR #67 commit `e492f81` and tick desynchronization drift are caught automatically by continuous integration before merging.
- Neutral, because developers must preserve the non-blocking pattern when adding new audio features or synthesizers.

### Confirmation

Automated `Playwright` E2E tests in [`tests/e2e/playback-startup-latency.test.ts`](../../tests/e2e/playback-startup-latency.test.ts) assert wall-clock and `PerformanceMeasure` durations against the defined budgets across both immediate and idle dwell scenarios. Dedicated performance benchmarks in [`tests/perf/audio-startup-benchmarks.test.ts`](../../tests/perf/audio-startup-benchmarks.test.ts) assert execution bounds on isolated engine construction and timeline algorithms.

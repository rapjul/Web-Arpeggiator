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

We need an enforced architectural latency contract that bounds cold-start and warm-restart durations, decouples auxiliary background tasks from playback onset, provides high-resolution standardized telemetry via the Web Performance API, and guards against performance regressions with automated benchmarks.

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

### 2. High-Resolution Lifecycle Telemetry
The core module [`src/core/telemetry.js`](../../src/core/telemetry.js) manages standard microsecond-accurate Web Performance API markers across audio initialization:
- `audio:user-start-gesture`: Moment the user clicks "Start Audio", "Start and Enable Audio", or a sound starter card.
- `audio:modules-loading` / `audio:modules-loaded`: Dynamic ES module importing of `Tone.js` and audio submodules.
- `audio:context-resuming` / `audio:context-resumed`: Asynchronous `Tone.start()` / `AudioContext.resume()` execution.
- `audio:engine-creating` / `audio:engine-created`: Graph construction of synths, effects chain, limiter, and analyser.
- `audio:settings-applying` / `audio:settings-applied`: Settings snapshot hydration and parameter synchronization.
- `audio:transport-starting`: Scheduler kickoff and `Tone.Transport.start()`.
- `audio:first-step-executed`: First note step processed and audible, synchronizing with the first active step pip indicator.

In Vite development mode (`import.meta.env.DEV`), `logStartupWaterfall()` outputs a structured diagnostic table (`console.table`) detailing the millisecond duration of each phase.

### 3. Latency Budgets & Automated Verification
- **Cold Start Budget**: Under **2500ms** in headless browser `CI` (typically 400–800ms on desktop hardware). Verified by `tests/e2e/playback-startup-latency.test.ts`.
- **Warm Restart Budget**: Under **300ms** from clicking "Restart Audio" until the first step pip activates. Verified by `tests/e2e/playback-startup-latency.test.ts`.
- **Subsystem Algorithmic Budgets**: Pure domain computations (100-cycle 480-PPQ timeline compilation < 100ms, 500 settings snapshot mergers < 100ms, telemetry overhead < 0.1ms per cycle). Verified by `tests/unit/audio-startup-benchmarks.test.ts`.

### Consequences

- Good, because users experience immediate musical response when interacting with the app.
- Good, because background pre-warming guarantees that real-time recording remains ready without penalizing transport latency.
- Good, because granular Performance API measures enable instant debugging of any startup bottleneck in Chrome DevTools without code edits.
- Good, because regressions like PR #67 commit `e492f81` are caught automatically by continuous integration before merging.
- Neutral, because developers must preserve the non-blocking pattern when adding new audio features or synthesizers.

### Confirmation

Automated `Playwright` E2E tests in [`tests/e2e/playback-startup-latency.test.ts`](../../tests/e2e/playback-startup-latency.test.ts) assert wall-clock and `PerformanceMeasure` durations against the defined budgets. Unit benchmarks in [`tests/unit/audio-startup-benchmarks.test.ts`](../../tests/unit/audio-startup-benchmarks.test.ts) assert execution bounds on isolated engine construction and timeline algorithms.

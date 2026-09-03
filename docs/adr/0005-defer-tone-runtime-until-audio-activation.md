# 0005. Defer Tone.js Runtime Until Explicit Audio Activation

* Status: accepted
* Deciders: rapjul, Codex
* Date: 2026-09-03

## Context and Problem Statement

Browsers prohibit starting or creating audible Web Audio work before a user gesture. Tone.js creates transport scheduling infrastructure, including real-time audio nodes, while its runtime modules are evaluated. Loading Tone.js or accessing `Tone.getTransport()` during application bootstrap therefore caused browser autoplay warnings before a user could intentionally enable audio.

Suppressing browser warnings, granting autoplay permission, or loosening the browser policy would conceal the problem and would not work consistently across browsers. The application must preserve its pre-activation preset, session, MIDI, and UI behavior without constructing a live audio graph.

## Decision Drivers

* Prevent browser autoplay warnings without bypassing autoplay protection.
* Require an intentional audio action before creating or resuming real-time Web Audio resources.
* Preserve restored preset and session values before audio activation.
* Ensure every audio-producing entry point follows one activation path.
* Make runtime initialization recoverable when a partially created audio graph fails.

## Decision Outcome

Chosen approach: **defer the Tone.js runtime until explicit audio activation**, defined as follows:

1. **No eager Tone.js runtime access**:
   - Application bootstrap code must not statically import a module that imports Tone.js.
   - Before activation, code must not access `Tone.getContext()`, `Tone.getTransport()`, construct Tone nodes, patterns, loops, effects, analysers, or recorders, or otherwise cause Tone.js module evaluation.

2. **One explicit activation path**:
   - `startAudio()` is the single gateway for live-audio work.
   - It dynamically loads Tone.js and Tone-dependent modules only from a user-initiated audio action, resumes the context with `Tone.start()`, and only then initializes the runtime.
   - Start Audio, Play/Restart, Quick Start, Sound Starters, recording, and audio-export controls must use this path before doing audio work.

3. **Idempotent transactional initialization**:
   - The live engine, visualizer, recorder manager, transport settings, and initial pattern are initialized through a shared in-flight promise.
   - Initialization publishes the runtime only after all components are ready.
   - If initialization fails, temporary audio nodes and visualizer browser resources must be disposed so a later explicit attempt can recover cleanly.

4. **Pre-activation work remains UI and state only**:
   - Preset, URL, and session restoration update DOM controls and application state without requiring Tone.js.
   - Guarded callbacks apply the accumulated state to the engine after activation.
   - MIDI export and preset/session serialization remain available without starting Web Audio.

5. **Regression protection**:
   - Browser E2E coverage must verify that a fresh load produces no autoplay warnings or live audio engine before activation.
   - Coverage must also verify that an explicit activation creates the engine once, resumes the context, and restores settings accumulated before activation.

### Positive Consequences

* The application respects browser autoplay requirements without console-warning suppression or permission workarounds.
* Users can inspect and restore settings before choosing to start audio.
* All audio controls share consistent startup, failure recovery, and suspended-context behavior.
* The startup contract is explicit for future contributors who add Tone.js-dependent features.

### Negative Consequences

* Tone.js-dependent code cannot run at module evaluation time and must tolerate the runtime being unavailable.
* Audio controls become asynchronous and must handle activation failures without unhandled promise rejections.
* New audio features require an activation-path review and browser regression coverage.

## Considered Alternatives

* **Create the audio graph during bootstrap and resume it later**: rejected because construction itself can trigger autoplay warnings and violates the pre-gesture policy.
* **Suppress browser warnings or request autoplay permission**: rejected because it hides policy violations and is not portable or reliable.
* **Start audio after any form edit**: rejected because changing non-audio settings is not an explicit request to produce sound.

## Links

* [Application activation gateway](../../src/app.js)
* [Audio engine](../../src/audio/audio-engine.js)
* [Settings restoration](../../src/storage/settings-manager.js)
* [Autoplay browser coverage](../../tests/e2e/audio-autoplay-warnings.test.ts)
* [ADR 0002: Modular ES Source Architecture](./0002-modular-es-source-architecture.md)
* [Architecture Guide](../../AGENTS.md)

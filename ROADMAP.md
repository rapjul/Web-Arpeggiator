# Web Arpeggiator Roadmap

This document outlines planned architectural, performance, and functional improvements for future releases of Web Arpeggiator.

## Performance & Audio Engine Optimization

### 1. Lazy Synth Instantiation
- **Objective**: Reduce initial audio runtime activation latency and main-thread execution time.
- **Description**: Currently, `createAudioEngine()` in `src/audio/audio-engine.js` eagerly instantiates all seven synthesizers (`Tone.Synth`, `Tone.FMSynth`, `Tone.AMSynth`, `Tone.MonoSynth`, `Tone.DuoSynth`, `Tone.PluckSynth`, and `Tone.MembraneSynth`) along with all oscillators, modulation envelopes, comb filters, and noise buffers during `startAudio()`.
- **Strategy**: Instantiate only the default synthesizer (`Tone.Synth`) at startup, and construct the remaining six synthesizers on-demand when first selected by the user or when needed for an offline render.

### 2. Audio Module Bundle Prefetching
- **Objective**: Eliminate network download latency when the user first triggers audio activation.
- **Description**: Under ADR 0005 (`./docs/adr/0005-defer-tone-runtime-until-audio-activation.md`), `Tone.js` is dynamically loaded on the first user interaction to comply with browser autoplay policies and avoid console warnings.
- **Strategy**: Inject a `<link rel="prefetch" as="script">` tag during browser idle time to pre-populate the HTTP/disk cache with the `Tone.js` bundle chunk without executing or evaluating it prior to an explicit user gesture.

## Synthesis & Pattern Generation

### 3. Custom Arpeggiator Step Modifiers
- **Objective**: Allow per-step velocity, gate, and octave modifiers within active pattern sequences.
- **Description**: Extend the 480-PPQ musical timeline contract in `src/core/timeline.js` to support per-step micro-timing offsets, probability masks, and dynamic velocity curves.

## PWA & Storage

### 4. Background Service Worker Asset Management
- **Objective**: Streamline offline storage recovery and precache invalidation.
- **Description**: Expand the Workbox runtime cache management API in `sw.js` and `src/pwa/pwa.js` to provide user-facing cache size metrics and granular storage quotas.

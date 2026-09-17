# Web Arpeggiator Architecture

This document is the authoritative map of the application’s module boundaries. The project separates pure music logic, Tone.js audio behavior, browser persistence, DOM controllers, application state, and PWA lifecycle code while keeping cross-feature composition in `src/app.js`.

## Composition Root

`src/app.js` is the composition root. It creates the injected DOM reference registry and application-state factory, composes the settings manager, and wires callbacks between controllers and the live audio graph. It should not accumulate feature-specific event handlers, DOM lookup details, or platform-specific workflows.

The root retains the integration callbacks needed to connect focused modules to shared state and live audio. Controllers receive platform dependencies through their factory arguments, own their listeners and UI formatting, and expose teardown methods.

## Module Ownership

### Core

`src/core/` contains browser- and audio-independent algorithms and contracts:

- Pattern transformation, scale quantization, randomization, and chord construction.
- Settings validation, merging, history snapshots, and URL preset serialization.
- The shared 480-PPQ musical timeline compiler used by playback, previews, offline audio, and MIDI.
- Audio encoding helpers, MIDI generation, duration calculations, input filtering, and visualizer math.

### Audio

`src/audio/` contains Tone.js synthesis and scheduling plus audio lifecycle orchestration:

- `audio-engine.js` owns the live signal chain and synthesis parameters.
- `pattern-generator.js` owns transport-synchronized scheduling from compiled timeline events.
- `recorder.js` owns real-time recording and offline audio encoding/rendering from the same timeline.
- `runtime-controller.js` owns deferred Tone loading, runtime construction, pending settings, and partial-runtime cleanup.
- `playback-controller.js` owns transport start/stop and suspended AudioContext recovery.
- `static-loop-renderer.js` owns one-cycle offline rendering used by visualizer previews.

### Shared Musical Timeline

`src/core/timeline.js` is the timing boundary shared by every musical output. It materializes the selected pattern once, assigns each event an absolute integer tick position at 480 PPQ, applies the configured swing offset, bounds each gate before the next event, and preserves the authored-note/source-step mapping.

Live playback adapts that timeline to `Tone.Pattern` so the existing transport lifecycle remains intact. Static previews and offline audio schedule the compiled events directly. MIDI converts the same absolute starts and ends into delta-time events. These consumers keep Tone transport swing disabled when the timeline has already applied swing, preventing double timing offsets.

### Recording Signal Path

The live signal path ends at `reverb → postGain → limiter → destination`. The recorder connects to the limiter output after post-gain, using post-gain as the fallback when limiter construction is unavailable. This keeps monitoring and recording aligned for master-volume changes and limiter protection.

When recording begins while transport is stopped, the recorder starts before playback is requested so the first scheduled event is captured. Browser media is retained as the source blob, decoded once into an `AudioBuffer`, and converted to actual PCM WAV and/or MP3 data from that shared decoded buffer. Decode and conversion failures leave the source available for a later retry.

### Storage

`src/storage/` owns persistence contracts and storage adapters:

- `settings-manager.js` serializes and restores the complete settings contract.
- `session-manager.js` coordinates workspace autosave and restoration.
- `presets-store.js` provides IndexedDB browser-preset CRUD and recovery behavior.

### Application State

`src/state/application-state.js` creates isolated shared state for the composition root and injected controllers. It owns transport, pattern, keyboard, waveform fallback, and AudioContext state while preserving the audio-engine proxy for active synth and waveform access.

### UI

`src/ui/` contains DOM controllers and visual rendering:

- Pattern, synth, transport, effects, onboarding, keyboard, visualizer, note-step, and accessibility controllers own their respective controls.
- `dom-references.js` builds the complete injected DOM reference registry and resolves reset targets for the composition root.
- `workspace-controller.js` coordinates settings history, resets, autosave, and session restoration.
- `export-controls-controller.js` coordinates recording/export controls, automatic or custom effects-tail duration readouts, offline modes, and loop-preview requests.
- `preset-controller.js` renders factory and saved preset lists and sound-starter cards.
- `preset-workflow-controller.js` coordinates URL sharing, file import, future-version confirmation, and browser-preset persistence actions.

### PWA

`src/pwa/pwa.js` owns service-worker registration and update lifecycle integration. The custom service worker remains configured through Vite PWA and Workbox.

## Runtime Flow

Audio-dependent modules remain deferred until an explicit user action:

```text
User action
    ↓
runtime-controller
    ├── load Tone and audio modules
    ├── construct the engine, visualizer, recorder, and pattern controller
    ├── apply pending settings
    └── publish runtime accessors
    ↓
playback-controller / UI controllers
```

Settings changes flow from DOM controllers through injected callbacks into the settings manager and live audio graph. Workspace history and autosave observe document changes without owning the settings schema.

Musical settings flow into `compileTimeline` before they reach an output boundary:

```text
settings + pattern direction
            ↓
     core/timeline.js
       ↙      ↓       ↘
 live Tone   offline   MIDI SMF
 playback    audio     export
```

## Source Layout

```text
src/
├── core/       # Pure algorithms and serializable contracts.
├── audio/      # Tone.js engine, scheduling, recording, and audio lifecycle.
├── storage/    # Settings, session, and browser-preset persistence.
├── ui/         # DOM controllers, reference registry, and visual rendering.
├── state/      # Isolated application state factory.
├── pwa/        # Service-worker registration lifecycle.
└── app.js      # Settings and cross-feature callback composition root.
```

## Composition Boundary

The composition root remains intentionally responsible for controller construction, settings-manager composition, and cross-feature callback wiring. DOM references and mutable application state are supplied by focused factories; future changes should preserve those injected contracts and controller ownership boundaries.

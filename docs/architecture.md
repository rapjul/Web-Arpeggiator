# Web Arpeggiator Architecture

This document is the authoritative map of the application’s module boundaries. The project separates pure music logic, Tone.js audio behavior, browser persistence, DOM controllers, and PWA lifecycle code while keeping composition in `src/app.js`.

## Composition Root

`src/app.js` is the composition root. It performs DOM lookup, owns shared application state, composes the settings manager, and wires callbacks between controllers and the live audio graph. It should not accumulate feature-specific event handlers or platform-specific workflows.

The root retains the integration callbacks needed to connect focused modules to shared state and live audio. Controllers receive platform dependencies through their factory arguments, own their listeners and UI formatting, and expose teardown methods.

## Module Ownership

### Core

`src/core/` contains browser- and audio-independent algorithms and contracts:

- Pattern transformation, scale quantization, randomization, and chord construction.
- Settings validation, merging, history snapshots, and URL preset serialization.
- Audio encoding helpers, MIDI generation, duration calculations, input filtering, and visualizer math.

### Audio

`src/audio/` contains Tone.js synthesis and scheduling plus audio lifecycle orchestration:

- `audio-engine.js` owns the live signal chain and synthesis parameters.
- `pattern-generator.js` owns transport-synchronized pattern scheduling.
- `recorder.js` owns real-time recording and offline audio encoding/rendering.
- `runtime-controller.js` owns deferred Tone loading, runtime construction, pending settings, and partial-runtime cleanup.
- `playback-controller.js` owns transport start/stop and suspended AudioContext recovery.
- `static-loop-renderer.js` owns one-cycle offline rendering used by visualizer previews.

### Storage

`src/storage/` owns persistence contracts and storage adapters:

- `settings-manager.js` serializes and restores the complete settings contract.
- `session-manager.js` coordinates workspace autosave and restoration.
- `presets-store.js` provides IndexedDB browser-preset CRUD and recovery behavior.

### UI

`src/ui/` contains DOM controllers and visual rendering:

- Pattern, synth, transport, effects, onboarding, keyboard, visualizer, note-step, and accessibility controllers own their respective controls.
- `workspace-controller.js` coordinates settings history, resets, autosave, and session restoration.
- `export-controls-controller.js` coordinates recording/export controls, duration readouts, offline modes, and loop-preview requests.
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

## Source Layout

```text
src/
├── core/       # Pure algorithms and serializable contracts.
├── audio/      # Tone.js engine, scheduling, recording, and audio lifecycle.
├── storage/    # Settings, session, and browser-preset persistence.
├── ui/         # DOM controllers and visual rendering.
├── pwa/        # Service-worker registration lifecycle.
└── app.js      # DOM, state, settings, and callback composition root.
```

## Deferred Follow-up

The composition root is intentionally the remaining integration boundary. A future focused PR may extract a DOM-reference factory/registry and an application-state factory from `src/app.js`. That work should preserve the current injected callbacks, settings-manager contract, and controller ownership boundaries.

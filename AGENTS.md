# Web Arpeggiator - Architecture & Usage Guide

## Overview

Web Arpeggiator is a browser-based musical arpeggiator application built with vanilla JavaScript, Tone.js, Tonal.js and Tailwind CSS. It generates musical arpeggios with real-time control over synthesis parameters, patterns, effects, and provides both live recording and offline export capabilities.

## Core Technologies

- **Tone.js**: Web Audio API framework for synthesis, effects, and timing
- **Tonal.js**: Music theory library for scale quantization
- **LameJS**: MP3 encoding for audio export
- **Tailwind CSS**: Utility-first CSS framework for UI styling
- **Vite PWA + Workbox**: Builds the custom service worker with injected precache assets, routing, stale-cache cleanup, and bounded runtime caching

## Architecture

### Composition Root and Controller Boundaries

See the [Architecture Guide](./docs/architecture.md) for the detailed module ownership map, runtime flow, and source layout. For agent work, use `src/ui/dom-references.js` for initialization-time DOM lookup and `src/state/application-state.js` for shared mutable state; keep settings-manager composition and final cross-feature callback wiring in `src/app.js`. Add new control listeners to the relevant focused controller and preserve its teardown boundary.

Playback, previews, offline audio, and MIDI exports share the 480-PPQ musical timeline compiler in `src/core/timeline.js`; keep note resolution, swing, gate lengths, and event boundaries in that shared contract.

### 1. Audio Engine

The audio signal chain follows this path:

```
Synths → Distortion → Filter → Chorus → Auto-pan → Delay → Reverb ─┬→ Analyzer (visualizer)
                                                                     └→ Post gain → Limiter ─┬→ Destination (speakers)
                                                                                            └→ Recorder (capture)
```

#### Synthesizers

Three synthesizer types are available:

- **Basic Synth** (`Tone.Synth`): Simple oscillator with ADSR envelope
    - **Waveforms**: sine, square, sawtooth, triangle
    - **Duty Cycle**: Control time on/off for square waves

- **FM Synth** (`Tone.FMSynth`): Frequency modulation synthesis
    - **Harmonicity**: Frequency ratio between carrier and modulator
    - **Modulation Index**: Depth of FM effect

- **AM Synth** (`Tone.AMSynth`): Amplitude modulation synthesis
    - **Harmonicity**: Frequency ratio for modulation

All synths share a common ADSR (Attack, Decay, Sustain, Release) envelope.

#### Effects Chain

1. **Filter** (`Tone.Filter`): Lowpass filter with cutoff frequency (100-10000 Hz) and resonance (Q: 0-20)
2. **Delay** (`Tone.FeedbackDelay`): Feedback delay set to 8th notes with adjustable wet/dry mix
3. **Reverb** (`Tone.Reverb`): Room reverb with 1.5s decay and adjustable wet/dry mix
4. **Limiter** (`Tone.Limiter`): Master limiter at 0dB to prevent clipping

### 2. Pattern Generation System

The arpeggiator generates note sequences based on:

#### Base Configuration

- **Notes**: User-defined note sequence (e.g., "C4 E4 G4")
- **Octave Shift**: Transpose entire pattern by octaves (-3 to +3)
- **Octave Range**: Duplicate pattern across multiple octaves (1-5)
- **Interval**: Note duration (64n, 32n, 16n, 8n, 4n, 2n)
- **Gate Length**: Note length as percentage of interval (0.1-1.0)

#### Pattern Directions

- **Up**: Ascending order
- **Down**: Descending order
- **Up-Down**: Ascending then descending (exclusive endpoints)
- **Down-Up**: Descending then ascending (exclusive endpoints)
- **Up-Down (Repeated)**: Ascending then descending (inclusive endpoints)
- **Down-Up (Repeated)**: Descending then ascending (inclusive endpoints)
- **Random Step**: Seeded random note selection each step, with repeats allowed
- **Random Cycle**: Seeded shuffle that plays every resolved note once per cycle
- **Octave Cycle**: Each note played across 3 octaves, repeated twice
- **Octave Cycle Reverse**: Octave cycle in descending order
- **Octave Cycle Ping-Pong**: Octave cycle with directional reversal
- **Random Walk**: Continuous seeded adjacent-note progression across cycle boundaries
- **Drunkard's Walk**: Continuous seeded walk with occasional reflected leaps

#### Scale Quantization

When enabled, input notes are quantized to the nearest scale degree:

- **Root Note**: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
- **Scale Type**: Major, minor, harmonic minor, melodic minor, dorian, phrygian, lydian, mixolydian, locrian, blues, chromatic (no quantization)

Uses Tonal.js to calculate scale pitches and find nearest MIDI note.

### 3. Transport System

Powered by `Tone.getTransport()`:

- **BPM**: 40–240 beats per minute
- **Swing**: 0-1 (applies shuffle/swing feel)
- **Pattern**: `Tone.Pattern` iterates through notes according to selected direction

### 4. Recording & Export

#### Real-time Recording

- Captures live audio output during performance
- Supports parameter changes during recording
- Dual recorder system:
    - **`MediaRecorder`** (preferred on HTTPS): Native browser API
    - **`Tone.Recorder`** (fallback): Works in all contexts including HTTP/Canvas

#### Offline Audio Export

- **Seamless loop (WAV)**: Repeats the selected event timeline before the selected cycles to establish envelope, delay, and reverb state; preserves swung starts and gate lengths, then crops the WAV to the exact musical sample count without altering the PCM boundary.
- Seamless loop validates Chorus and Auto-pan phase alignment across the requested Pattern cycles. When an active modulation effect cannot return to its starting phase, users must adjust the cycle count, disable the effect, or choose Include effects tail.
- **Include effects tail**: Preserves a cold start, waits for the final scheduled gate to end, and then appends 0–10 seconds of effects decay; legacy presets default to this mode with a 2-second tail.
- Both modes use `Tone.Offline`, support 1-100 pattern cycles, and avoid real-time timing variation. MP3 includes gapless delay/padding metadata for compatible players, but WAV remains the sample-exact format.
- Offline WAV and MP3 exports embed a versioned settings snapshot, materialized pattern sequence, and render timing. The binary layouts and future import contract are documented in [`docs/audio-export-metadata.md`](./docs/audio-export-metadata.md).

#### Export Formats

- **WAV**: Lossless 16-bit PCM audio
- **MP3**: Compressed audio using LameJS encoder (128kbps)
- **MIDI (.mid)**: Pure binary Standard MIDI File (SMF Format 0) export for external DAWs. Detailed technical specifications are available in [`docs/midi-specification.md`](./docs/midi-specification.md).

WAV and MP3 audio formats support simultaneous batch export via checkboxes, while MIDI pattern files are exported on-demand via a dedicated export button with timestamped filenames.

### 5. Visualizer

Real-time waveform visualizer using HTML5 Canvas:

- Displays audio waveform data from `Tone.Analyser`
- Updates at 30 Hz via `Tone.Loop`
- Shows time (horizontal) and amplitude (vertical) axes
- High-DPI support with device pixel ratio scaling
- Responsive canvas sizing

### 6. Virtual Keyboard

Piano keyboard interface with two octaves (C3-B4):

- **Visual Feedback**: Active notes highlight during playback
- **Monophonic Input**: Click/tap to play individual notes
- **Auto-Release**: Notes automatically release on `mouseout`
- **Responsive Design**: Stacks vertically on mobile (less than 768px width)

### 7. Preset System

JSON-based preset management:

#### Saved Parameters

- Synth type and waveform
- All synthesis parameters (ADSR, harmonicity, mod index, duty cycle)
- Transport settings (BPM, swing)
- Pattern configuration (notes, direction, interval, gate, octaves)
- Scale quantization settings
- Effects parameters (filter, delay, reverb)

#### Format

```json
{
  "synthType": "synth",
  "waveform": "sine",
  "bpm": 120,
  "swing": 0,
  "notes": "C4 E4 G4",
  "patternDirection": "up",
  "noteInterval": "16n",
  "gateLength": 0.8,
  ...
}
```

Presets are saved with automatic timestamped filenames.

New settings snapshots include `settingsVersion: 1`. Missing versions are legacy and normalize automatically; malformed explicit versions and newer versions are rejected by default. A file import from a newer valid version offers an explicit “Load Compatible Settings” choice, while browser presets and sessions remain untouched.

### 8. Randomize Notes

Offline-friendly note sequence generation using local music theory calculations:

- **Feature**: Generates a random sequence of 4–6 unique ascending notes in octaves 3–5.
- **Scale Quantization**: When scale quantization is enabled, notes are generated strictly from the pitches in the active scale (e.g., F minor or C major).
- **Chromatic Mode**: When quantization is disabled or set to chromatic, a random scale mode is chosen under the hood to ensure the generated notes are musically coherent.

### 9. Chord Starters

Scale-aware chord buttons insert major, minor, seventh, sus4, power, or pentatonic notes from the selected root. Chord construction lives in the pure `src/core/chord-builder.js` module and falls back safely for invalid chord types or octave values.

## State Management

Application state created by `src/state/application-state.js`:

```javascript
{
  isPlaying: boolean,                 // Transport running
  currentNotes: string[],             // Base note sequence
  currentWaveform: string,            // Active waveform type
  activeSynth: ToneSynth|null,         // Currently selected synth
  currentOctaveShift: number,         // -3 to +3
  currentOctaveRange: number,         // 1 to 5
  activeNote: string|null,             // Currently playing keyboard note
  isAudioContextStarted: boolean      // Audio runtime activation state
}
```

## Key Functions

### Audio Initialization

```javascript
startAudio();
// Initializes Tone.js context, requires user gesture (autoplay policy)
// Enables all audio controls after successful start
```

### Pattern Management

```javascript
createOrUpdatePattern();
// Generates Tone.Pattern from current settings
// Applies scale quantization if enabled
// Handles all pattern direction transformations
```

### Recording Control

```javascript
startRecording() / stopRecording();
// Manages recorder state and timing
// Handles fallback between MediaRecorder and Tone.Recorder
```

### Export Functions

```javascript
exportRealtimeRecording();
// Converts recorded blob to WAV/MP3
// Generates timestamped files

exportOfflineRender(loopCount);
// Renders seamless WAV loops or effects-tail WAV/MP3 exports using Tone.Offline
```

### Preset I/O

```javascript
savePreset();
// Serializes all settings to JSON
// Downloads with timestamp

loadPreset(file);
// Parses JSON preset
// Updates all UI controls and synth parameters
```

## UI Components

### Main Controls

- **Start Audio**: Initializes Web Audio context
- **Play/Stop/Restart**: Transport control

### Synth Section

- Synth type selector (Basic/FM/AM)
- Waveform buttons (sine, square, sawtooth, triangle)
- ADSR envelope sliders
- Advanced parameters (harmonicity, modulation index, duty cycle)

### Transport & Pattern

- BPM slider (40-240)
- Swing control (0-1)
- Notes input (space-separated, validated)
- Chord starter buttons for common scale-aware note groups
- Pattern direction buttons (9 options)
- Interval selector (note duration)
- Gate length slider (note length)

### Octave Controls

- Octave shift buttons (-3 to +3)
- Octave range buttons (1-5)

### Scale Quantizer

- Toggle enable/disable
- Root note selector
- Scale type selector

### Filter

- Cutoff frequency (100-10000 Hz)
- Resonance/Q factor (0-20)

### Effects

- Delay wet/dry mix (0-1)
- Reverb wet/dry mix (0-1)

### Recording & Export

- Real-time record button
- Offline export controls
- Pattern cycle count, seamless/tail mode, and effects-tail duration controls
- Format checkboxes (WAV / MP3)
- Dedicated MIDI export button (.mid)

### Utilities

- Visualizer toggle and canvas
- Preset save/load buttons
- Randomize button next to notes input

## File Structure

```
Web Arpeggiator/
├── index.html              # Main application shell (PWA-enabled)
├── styles.css              # Main stylesheet importing modular styles
├── styles/                 # Modular CSS architecture
│   ├── base.css            # Base element rules, resets, accessibility utilities
│   ├── components.css      # Toasts, controls, tooltips, buttons
│   ├── features.css        # Sound starters, modals, sticky transport
│   ├── keyboard.css        # Interactive piano keyboard styles
│   ├── tokens.css          # Semantic CSS variables and theme tokens
│   └── visualizer.css      # Visualizer canvas and oscilloscope layout
├── vite.config.js          # Vite PWA config; generates manifest.webmanifest at build time
├── sw.js                   # Workbox-backed custom PWA worker and cache-control message API
├── AGENTS.md               # This file
├── docs/                   # Specifications, ADRs & architectural guides
│   ├── adr/                # Architectural Decision Records (MADR standard)
│   │   ├── 0001-vitest-and-v8-coverage-tooling.md
│   │   ├── 0002-modular-es-source-architecture.md
│   │   ├── 0003-defensive-input-validation-and-edge-case-testing-policy.md
│   │   ├── 0004-strict-type-safety-and-meaningful-behavioral-testing.md
│   │   ├── 0005-defer-tone-runtime-until-audio-activation.md
│   │   ├── 0006-persistent-settings-history-and-default-resets.md
│   │   ├── 0007-semantic-theme-tokens-and-modular-styles.md
│   │   ├── 0008-seamless-wav-export-invariants.md
│   │   ├── 0009-versioned-offline-audio-export-metadata.md
│   │   ├── 0010-retryable-indexeddb-storage-recovery.md
│   │   ├── 0011-playwright-browser-testing.md
│   │   ├── 0012-observable-playwright-synchronization-and-artifact-validation.md
│   │   └── 0013-workbox-custom-service-worker-caching.md
│   ├── architecture.md     # Module ownership, runtime flow, and deferred boundaries
│   ├── development.md      # Local setup, commands, and test-runner guidance
│   ├── improvements/       # Deferred, scoped follow-up plans
│   ├── history-and-default-settings.md # Default parameters and settings history reference
│   ├── midi-specification.md # Standard MIDI specification & implementation reference
│   └── pattern-directions.md # Detailed pattern descriptions & visual guide
├── src/                    # Modular source code
│   ├── core/               # Pure algorithms & domain logic (zero DOM/Audio dependencies)
│   │   ├── audio-utils.js  # WAV/MP3 encoding, PCM conversions, download helpers
│   │   ├── chord-builder.js # Scale-aware chord note construction
│   │   ├── export-duration.js # Offline export duration calculation & formatting
│   │   ├── input-filters.js# Keyboard note & numeric input filtering
│   │   ├── meter-utils.js  # Audio meter decibel & percentage calculations
│   │   ├── midi-export.js  # Standard MIDI File (.mid) binary encoder
│   │   ├── pattern-core.js # Core note transformations, directions, quantization math
│   │   ├── randomizer.js   # Musical scale-quantized randomizer
│   │   ├── settings-history.js # Persistent snapshot history for arpeggiator settings
│   │   ├── url-preset.js   # URL query parameter preset serialization
│   │   └── visualizer-math.js # Signal processing & FFT peak detection helpers
│   ├── audio/              # Web Audio / Tone.js synthesis and scheduling
│   │   ├── audio-engine.js # Tone.js synths, effects chain, setSynth, updateEnvelope
│   │   ├── pattern-generator.js # Pattern scheduling & transport sync
│   │   ├── playback-controller.js # Transport start/stop and AudioContext recovery
│   │   ├── recorder.js     # Real-time recording + offline Tone.Offline export
│   │   ├── runtime-controller.js # Deferred Tone loading and runtime construction
│   │   └── static-loop-renderer.js # One-cycle offline loop rendering for previews
│   ├── storage/            # Persistence and configuration management
│   │   ├── presets-store.js# IndexedDB preset persistence
│   │   ├── session-manager.js # Workspace auto-save and restoration lifecycle
│   │   └── settings-manager.js # Settings serialization/restoration
│   ├── state/              # Shared application state factories
│   │   └── application-state.js # Mutable state and audio-engine proxies
│   ├── ui/                 # DOM controllers and visual rendering
│   │   ├── a11y-navigation.js # WAI-ARIA arrow-key navigation for button groups
│   │   ├── dom-references.js # Injected application DOM reference registry
│   │   ├── effects-controls-controller.js # Post-gain, filter, and effects control wiring
│   │   ├── history-controller.js # Settings undo, redo, and reset interactions
│   │   ├── input-filter-controller.js # Notes and export-count keyboard filtering
│   │   ├── keyboard-controller.js # Virtual keyboard input handling
│   │   ├── note-step-controller.js # Pattern-step indicator rendering and updates
│   │   ├── onboarding-controller.js # First-visit and quick-start onboarding flow
│   │   ├── pattern-controls-controller.js # Notes, scale, octave, interval, and gate controls
│   │   ├── preset-controller.js # Factory and saved preset list interactions
│   │   ├── preset-workflow-controller.js # URL, file, and browser-preset workflows
│   │   ├── synth-controls-controller.js # Synth selection, envelope, and synth-specific controls
│   │   ├── transport-controller.js # Playback button and responsive sticky transport UI
│   │   ├── ui-feedback.js  # Toast alerts and UI status indicators
│   │   ├── export-controls-controller.js # Recording, export, and loop-preview controls
│   │   ├── visualizer.js   # Canvas waveform rendering, UI update loop, toggle
│   │   └── workspace-controller.js # History, reset, autosave, and session restoration
│   ├── pwa/                # Service Worker & PWA lifecycle
│   │   └── pwa.js          # Service worker registration
│   └── app.js              # Composition root for DOM, state, settings, and callbacks
├── exports/                # Generated audio test files
│   ├── realtime-recordings/
│   └── perfect-loops/
├── presets/                # Saved JSON presets
├── public/                 # Static assets, icons, and pattern SVGs
└── tests/                  # Unit and E2E test suites
```

## Development Guidelines

### Adding New Pattern Directions

1. Add a button in the Pattern Direction section with `data-pattern` attribute
2. Implement pattern logic in the `createOrUpdatePattern()` switch statement
3. Generate a custom note sequence or set a Tone.Pattern direction
4. Add SVG icon representing the pattern visually

### Adding New Synth Types

1. Instantiate the synth in the `synths` object
2. Connect it to the filter in the signal chain
3. Add UI controls for synth-specific parameters
4. Update `setSynth()` to handle parameter visibility
5. Add synth type button with `data-synth` attribute

### Modifying Effects

Effects are chained: `filter → delay → reverb → limiter → destination`

To add an effect:

1. Instantiate after existing effects
2. Insert in the chain at the desired position
3. Add UI controls
4. Connect to analyzer for visualizer support

### Working with Presets

All preset-related settings must be:

1. Saved in `savePreset()`
2. Loaded in `loadPreset()`
3. Applied to both the Tone.js objects AND UI controls

### Toast Notifications

Create the toast manager in the composition root, then inject its `showToast`
callback into controllers that need user feedback:

```javascript
const { showToast } = createToastManager({ toastContainer, liveRegion });
createController({ showToast });
// type: 'success', 'info', 'error'
```

## Browser Compatibility

### Requirements

- Modern browser with Web Audio API support
- JavaScript enabled
- User gesture required for audio (autoplay policy)

### HTTPS vs HTTP

- **HTTPS**: Full functionality including `MediaRecorder`
- **HTTP/Canvas**: Real-time recording uses `Tone.Recorder` fallback
- Offline export works in all contexts

### Mobile Considerations

- iOS: Set `navigator.audioSession.type = "playback"` to bypass silent mode
- Touch events: All controls support both mouse and touch
- Responsive design: Keyboard stacks on screens less than 768px

## Performance Optimization

- **Device Pixel Ratio**: Canvas scales for retina displays
- **Loop Optimization**: UI updates run at 30 Hz via `Tone.Loop`
- **Limiter Protection**: Master limiter prevents clipping
- **Pattern Caching**: Pattern regenerates only on parameter change
- **Lazy Loading**: Visualizer only updates when enabled

## Debugging

Verbose diagnostics and the Audio is ready toast are enabled automatically in Vite development mode and are omitted from production builds. `log()` respects that development-mode flag; do not edit application source to enable logging.

## Known Limitations

1. **MP3 Encoding**: Client-side encoding is CPU-intensive
2. **Recording Length**: Limited by browser memory for real-time recording
3. **Pattern Complexity**: Custom patterns limited to predefined options

## Future Enhancements

Potential areas for expansion:

- MIDI input/output support
- Additional synth types (Noise, Metal, Membrane)
- Advanced sequencing (per-step velocity, probability)
- Audio effects expansion (chorus, phaser, distortion)
- Multi-track recording
- WebAssembly-based MP3 encoding for performance
- Contextual per-setting Reset controls that appear only after a value differs from its default.

## Testing & Defensive Coding Standards

The project uses **Vitest** with `@vitest/coverage-v8` to guarantee quality, enforce minimum thresholds, and verify defensive programming standards across all modules.

### Automated Coverage Threshold Gates

Configured in [`vitest.config.ts`](./vitest.config.ts) and enforced on every Pull Request in [`.github/workflows/ci.yaml`](./.github/workflows/ci.yaml):
- **Statements**: ≥ 75%.
- **Branches**: ≥ 65%.
- **Functions**: ≥ 65%.
- **Lines**: ≥ 75%.

These are a ratcheted baseline while untested composition roots are extracted into smaller units. The long-term target is 80% statements, 70% branches, 80% functions, and 80% lines, raised only when meaningful unit coverage supports each increase. Playwright covers browser behavior but does not contribute to the V8 percentage gate.

### Mandatory Edge-Case Testing Requirements

When adding or modifying code, contributors and AI agents must test:
1. **Parsers & Deserializers (`url-preset.js`, `settings-manager.js`, `presets-store.js`)**:
   - Out-of-bounds numbers (below minimum, above maximum, `NaN`, `Infinity`, `null`, `undefined`).
   - Unknown synth models, unrecognized waveforms, unsupported scale modes, and invalid pattern directions.
   - Corrupted note strings and empty collections.
2. **Dispatchers & Synthesizer Graphs (`audio-engine.js`, `pattern-generator.js`)**:
   - Unknown synth models falling back safely to default `synth`.
   - Complete signal chain recreation in `createOfflineChain` matching live synthesis routing.
3. **Accessibility & Interactions (`a11y-navigation.js`, `keyboard-controller.js`)**:
   - Arrow-key navigation in radio button groups updating `.checked` state and firing `change` events.

See [`docs/adr/0003-defensive-input-validation-and-edge-case-testing-policy.md`](./docs/adr/0003-defensive-input-validation-and-edge-case-testing-policy.md) for full policy details.

### Strict Type-Safety & Meaningful Behavioral Testing

1. **Zero-Tolerance for Explicit `any`**:
   - Explicit `any`, `as any`, and `<any>` assertions are prohibited across both source code and test files, enforced automatically via Biome's `suspicious.noExplicitAny` lint rule.
   - Unit tests must use strongly typed fixture interfaces derived directly from module factories (`Parameters<typeof createModule>[0]`).
2. **Meaningful Behavioral Testing vs. Artificial Branch Padding**:
   - Unit tests must verify real observable contracts, state transitions, audio routing, mathematical algorithms, and defensive recovery (e.g. decode failures, storage unavailability).
   - Artificial tests written solely to flip the boolean branches of optional DOM elements are prohibited.

See [`docs/adr/0004-strict-type-safety-and-meaningful-behavioral-testing.md`](./docs/adr/0004-strict-type-safety-and-meaningful-behavioral-testing.md) for full policy details.

## Contributing

When modifying the codebase:

1. **Maintain Modular ES Module Architecture**: Keep logic separated into focused modules under the `src/` directory
2. **Run Tests & Verify Coverage**: Run `bun run test:coverage` and `bun run test:e2e` before submitting PRs. Vitest owns unit coverage; Playwright owns real-browser behavior.
3. **Document Decisions in ADRs**: Add new Architectural Decision Records in [`docs/adr/`](./docs/adr/) when introducing significant architectural shifts
4. **Test Audio Initialization**: Verify autoplay policy compliance
5. **Validate Presets**: Ensure all parameters save/load correctly
6. **Check Responsive Design**: Test on mobile and desktop
7. **Update Documentation**: Keep `AGENTS.md` and `README.md` synchronized with changes

## Version History

This is a living document. Major architectural changes are tracked in:

- Git commit history
- Architectural Decision Records in [`docs/adr/`](./docs/adr/)
- Technical guides and specifications in [`docs/`](./docs/)

---

**For AI Coding Agents**: This document provides the architectural context needed to understand, modify, and extend the Web Arpeggiator application. The application follows a modular architecture using ES modules located in the `src/` folder, with styling managed in `styles.css` and the entry point in `index.html`.

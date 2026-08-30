# Web Arpeggiator - Architecture & Usage Guide

## Overview

Web Arpeggiator is a browser-based musical arpeggiator application built with vanilla JavaScript, Tone.js, Tonal.js and Tailwind CSS. It generates musical arpeggios with real-time control over synthesis parameters, patterns, effects, and provides both live recording and offline export capabilities.

## Core Technologies

- **Tone.js**: Web Audio API framework for synthesis, effects, and timing
- **Tonal.js**: Music theory library for scale quantization
- **LameJS**: MP3 encoding for audio export
- **Tailwind CSS**: Utility-first CSS framework for UI styling

## Architecture

### 1. Audio Engine

The audio signal chain follows this path:

```
Synths → Filter → Delay → Reverb → Limiter → Destination (speakers)
                                 ↓
                              Analyzer (visualizer)
                              Recorder (capture)
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
- **Random**: Random note selection each step
- **Octave Cycle**: Each note played across 3 octaves, repeated twice
- **Octave Cycle Reverse**: Octave cycle in descending order
- **Octave Cycle Ping-Pong**: Octave cycle with directional reversal
- **Random Walk**: Constrained random progression (adjacent notes)
- **Random Walk (Drunkard)**: Random walk with occasional leaps

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

#### Offline Export (Perfect Loop)

- Renders exact loop count offline using `Tone.Offline`
- No real-time variations or timing issues
- Configurable loop count (1-100)

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

### 8. Randomize Notes

Offline-friendly note sequence generation using local music theory calculations:

- **Feature**: Generates a random sequence of 4–6 unique ascending notes in octaves 3–5.
- **Scale Quantization**: When scale quantization is enabled, notes are generated strictly from the pitches in the active scale (e.g., F minor or C major).
- **Chromatic Mode**: When quantization is disabled or set to chromatic, a random scale mode is chosen under the hood to ensure the generated notes are musically coherent.

## State Management

Global application state:

```javascript
{
  isPlaying: boolean,          // Transport running
  isRecording: boolean,        // Recording active
  currentNotes: string[],      // Base note sequence
  currentWaveform: string,     // Active waveform type
  activeSynth: ToneSynth,      // Currently selected synth
  currentOctaveShift: number,  // -3 to +3
  currentOctaveRange: number,  // 1 to 5
  isVisualizerOn: boolean,     // Visualizer enabled
  activeNote: string|null,     // Currently playing keyboard note
  liveRecordedWavBlob: Blob    // Recorded audio data
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
// Renders perfect loops using Tone.Offline
// Exports WAV/MP3 without real-time constraints
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
- Loop count input
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
├── styles.css              # Tailwind CSS styles
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── AGENTS.md               # This file
├── docs/                   # Specifications, ADRs & architectural guides
│   ├── adr/                # Architectural Decision Records (MADR standard)
│   │   ├── 0001-vitest-and-v8-coverage-tooling.md
│   │   ├── 0002-modular-es-source-architecture.md
│   │   ├── 0003-defensive-input-validation-and-edge-case-testing-policy.md
│   │   └── 0004-strict-type-safety-and-meaningful-behavioral-testing.md
│   ├── midi-specification.md # Standard MIDI specification & implementation reference
│   └── pattern-directions.md # Detailed pattern descriptions & visual guide
├── src/                    # Modular source code
│   ├── core/               # Pure algorithms & domain logic (zero DOM/Audio dependencies)
│   │   ├── audio-utils.js  # WAV/MP3 encoding, PCM conversions, download helpers
│   │   ├── input-filters.js# Keyboard note & numeric input filtering
│   │   ├── meter-utils.js  # Audio meter decibel & percentage calculations
│   │   ├── midi-export.js  # Standard MIDI File (.mid) binary encoder
│   │   ├── pattern-core.js # Core note transformations, directions, quantization math
│   │   ├── randomizer.js   # Musical scale-quantized randomizer
│   │   ├── url-preset.js   # URL query parameter preset serialization
│   │   └── visualizer-math.js # Signal processing & FFT peak detection helpers
│   ├── audio/              # Web Audio / Tone.js synthesis and scheduling
│   │   ├── audio-engine.js # Tone.js synths, effects chain, setSynth, updateEnvelope
│   │   ├── pattern-generator.js # Pattern scheduling & transport sync
│   │   └── recorder.js     # Real-time recording + offline Tone.Offline export
│   ├── storage/            # Persistence and configuration management
│   │   ├── navigation-manager.js # URL routing & query-state management
│   │   ├── presets-store.js# IndexedDB preset persistence
│   │   ├── session-manager.js # Workspace auto-save and restoration lifecycle
│   │   └── settings-manager.js # Settings serialization/restoration
│   ├── ui/                 # DOM controllers and visual rendering
│   │   ├── a11y-navigation.js # WAI-ARIA arrow-key navigation for button groups
│   │   ├── keyboard-controller.js # Virtual keyboard input handling
│   │   ├── ui-feedback.js  # Toast alerts and UI status indicators
│   │   └── visualizer.js   # Canvas waveform rendering, UI update loop, toggle
│   ├── pwa/                # Service Worker & PWA lifecycle
│   │   └── pwa.js          # Service worker registration
│   └── app.js              # Application entry point, DOM wiring, transport coordination
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

Use the global `showToast()` function:

```javascript
showToast(message, type);
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

Enable verbose logging:

```javascript
const DEBUG = true; // Set at top of script
```

All major functions call `log()` which respects the DEBUG flag.

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

## Testing & Defensive Coding Standards

The project uses **Vitest** with `@vitest/coverage-v8` to guarantee quality, enforce minimum thresholds, and verify defensive programming standards across all modules.

### Automated Coverage Threshold Gates

Configured in [`vitest.config.ts`](./vitest.config.ts) and enforced on every Pull Request in [`.github/workflows/ci.yaml`](./.github/workflows/ci.yaml):
- **Statements**: $\ge 80\%$
- **Branches**: $\ge 70\%$
- **Functions**: $\ge 80\%$
- **Lines**: $\ge 80\%$

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
2. **Run Tests & Verify Coverage**: Always run `bun run test:coverage` before submitting PRs
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

# Web Arpeggiator

A browser-based musical arpeggiator with real-time synthesis, effects, and recording capabilities.

## Overview

Web Arpeggiator is an interactive music tool that generates flowing musical patterns (arpeggios) from note sequences you provide. Combine it with customizable synthesizers, professional effects, and multiple pattern directions to create evolving soundscapes—all in your browser.

**Try it now**: Open `Web Arpeggiator.html` in any modern web browser.

## Features

### 🎹 Synthesis

- **Multiple Synth Types**: Basic (Sine, Square, Sawtooth, Triangle), FM (Frequency Modulation), AM (Amplitude Modulation)
- **Envelope Control**: ADSR (Attack, Decay, Sustain, Release) on all synths
- **Advanced Parameters**: Harmonicity, modulation index, duty cycle for waveform shaping

### 🎼 Patterns

- **11 Pattern Directions**: Up, Down, Up-Down, Down-Up, Random, Octave Cycle, Random Walk, and more
- **Configurable Notes**: Define any note sequence (e.g., "C4 E4 G4")
- **Octave Control**: Shift by -3 to +3 octaves or expand across 1-5 octaves
- **Tempo Control**: 40-240 BPM with swing adjustment
- **Note Intervals**: 64th notes through 2nd notes (1/64 to 2 bars)

### 🎛️ Effects

- **Filter**: Lowpass filter with cutoff (100-10,000 Hz) and resonance
- **Delay**: Feedback delay synced to the beat
- **Reverb**: Room reverb with adjustable mix
- **Limiter**: Master limiter to prevent clipping

### 🎵 Advanced Features

- **Scale Quantization**: Snap notes to scales (Major, Minor, Blues, Chromatic, etc.)
- **Virtual Keyboard**: Interactive two-octave piano interface
- **Real-Time Visualizer**: Waveform display during playback
- **Preset System**: Save and load complete configurations
- **AI Note Generation**: Generate note sequences from natural language (requires Gemini API key)

### 📊 Recording & Export

- **Real-Time Recording**: Capture your performance with parameter changes
- **Perfect Loop Export**: Render exact loops offline (1-100 loops)
- **Dual Format Export**: WAV (lossless) and MP3 (compressed)
- **Timestamped Files**: Automatic naming for organized exports

## Getting Started

### Requirements

- Modern web browser with Web Audio API support (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- User gesture required to start audio (click "Start Audio" button)

### Quick Start

1. **Open the app**: Double-click `Web Arpeggiator.html` or open it in your browser
2. **Initialize audio**: Click "Start Audio" (required for browser autoplay policy)
3. **Enter notes**: Type notes in the "Notes" field (e.g., `C4 E4 G4`)
4. **Play**: Click the play button to start the arpeggiator
5. **Adjust**: Change BPM, pattern direction, synth type, and effects in real-time

### Basic Workflow

```
1. Select a Synth Type (Basic Synth, FM Synth, AM Synth)
2. Enter Notes (space-separated, e.g., "C4 E4 G4 B4")
3. Choose Pattern Direction
4. Set BPM and Note Interval
5. Press Play
6. Adjust effects and parameters in real-time
7. Record or export your creation
```

## Note Format

Notes follow standard musical notation:

- **Pitch**: C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab, A, A#/Bb, B
- **Octave**: 0-8 (middle C = C4)
- **Examples**: `C4`, `D#5`, `Ab3`

Use spaces to separate multiple notes: `C4 E4 G4`

## Pattern Directions

| Direction                  | Behavior                               |
|----------------------------|----------------------------------------|
| **Up**                     | Ascending order                        |
| **Down**                   | Descending order                       |
| **Up-Down**                | Up then down (skip endpoint)           |
| **Down-Up**                | Down then up (skip endpoint)           |
| **Up-Down (Repeated)**     | Up then down (include endpoint)        |
| **Down-Up (Repeated)**     | Down then up (include endpoint)        |
| **Random**                 | Random selection each step             |
| **Octave Cycle**           | Each note across 3 octaves, ascending  |
| **Octave Cycle Reverse**   | Each note across 3 octaves, descending |
| **Octave Cycle Ping-Pong** | Octave cycle with reversal             |
| **Random Walk**            | Constrained random (adjacent notes)    |

For detailed pattern descriptions, see [Pattern Directions Guide](./PATTERN_DIRECTIONS.md).

## Recording & Export

### Real-Time Recording

- Records live audio during playback
- Changes to parameters are captured in real-time
- Use on HTTPS for best browser compatibility
- Falls back to `Tone.Recorder` on HTTP or non-HTTPS contexts

### Perfect Loop Export (Offline)

- Renders loops offline without real-time variations
- Produces perfectly quantized audio
- Supports 1-100 loop repetitions
- Best for creating clean, production-ready audio

### Export Formats

- **WAV**: Lossless 16-bit PCM (larger file size, highest quality)
- **MP3**: Compressed 128kbps (smaller file size, suitable for web)

## Presets

Save and load your complete setup:

### Save a Preset

1. Configure all parameters (synth, effects, pattern, etc.)
2. Click "Save Preset"
3. A JSON file downloads with auto-generated timestamp

### Load a Preset

1. Click "Load Preset"
2. Select a saved JSON file
3. All settings restore instantly

Presets store:

- Synth type and waveform selection
- ADSR envelope and all synthesis parameters
- Transport settings (BPM, swing)
- Pattern configuration
- Scale quantization settings
- Effects parameters (filter, delay, reverb)

## Scale Quantization

Snap all input notes to a musical scale:

1. **Enable Scale Quantization**: Toggle the checkbox
2. **Select Root Note**: Choose the tonal center (C, D, E, F, G, A, B, etc.)
3. **Select Scale Type**: Major, Minor, Harmonic Minor, Dorian, Blues, Chromatic, etc.
4. **Input Notes**: Any notes you enter will snap to the nearest scale degree

Example: With C Major selected, the note "C#4" becomes "D4"

## Technologies

- **[Tone.js](https://tonejs.org/)** (v14.8.49): Web Audio API framework for synthesis and effects
- **[Tonal.js](https://github.com/tonaljs/tonal)** (v6.4.2): Music theory library for scale operations
- **[LameJS](https://www.npmjs.com/package/lamejs)** (v1.2.1): Client-side MP3 encoding
- **[Tailwind CSS](https://tailwindcss.com/)**: Utility-first CSS styling

## Documentation

- **[AGENTS.md](AGENTS.md)**: Detailed architecture, development guide, and technical reference
- **[Pattern Directions Guide](guides/Pattern_Directions_Guide.md)**: Visual and descriptive guide to all 11 pattern types
- **[Tone.js Transport Docs](guides/Transport%20·%20Tonejs_Tone.js%20Wiki.md)**: Reference for timing and synchronization
- **[Changes Log](guides/changes/)**: Development history and improvements

## Browser Support

| Browser         | Status         |
|-----------------|----------------|
| Chrome/Chromium | ✅ Full support |
| Firefox         | ✅ Full support |
| Safari          | ✅ Full support |
| Edge            | ✅ Full support |

### HTTPS vs HTTP

- **HTTPS**: Full functionality with `MediaRecorder` for real-time recording
- **HTTP/Canvas**: Real-time recording uses `Tone.Recorder` fallback; offline export works everywhere

### Mobile

- Touch events supported on all controls
- Responsive design adapts to smaller screens
- Keyboard stacks vertically on screens < 768px

## Keyboard Shortcuts

- **Play/Stop**: Use the Play/Stop button (no keyboard shortcut currently assigned)
- **Virtual Piano**: Click keys to play notes during performance

## Tips & Tricks

### Creating Interesting Patterns

1. Start with 3-4 notes in your sequence
2. Try the "Octave Cycle" pattern to hear notes across multiple octaves
3. Use "Random Walk" for less predictable but still musical progressions
4. Combine octave shift with pattern direction for variations

### Using Scale Quantization

- Set a root note and scale to constrain notes to musical keys
- Blues scale works great for expressive, bent-note sounds
- Switch scales in real-time while playing

### Effects Layering

- Start with light reverb (0.2-0.3 mix) for spaciousness
- Add delay (0.3-0.5 mix) for rhythmic interest synced to tempo
- Use filter cutoff to shape the overall tone

### Recording Tips

- Use real-time recording for performance captures
- Use offline export for clean, loopable audio
- Record multiple takes and compare MP3 and WAV exports

## Limitations

- **AI Generation**: Requires user-provided Google Gemini API key (not included)
- **MP3 Encoding**: Client-side encoding is CPU-intensive; larger exports may take time
- **Recording Length**: Limited by available browser memory
- **Pattern Complexity**: Patterns are predefined; custom patterns require code modification

## Troubleshooting

### No Sound?

1. Click "Start Audio" button first (browser autoplay policy)
2. Check system volume
3. Verify Web Audio API support in your browser
4. On Safari iOS: Ensure the browser is not in silent mode

### Recording Doesn't Work?

- HTTPS contexts use `MediaRecorder` (most reliable)
- HTTP contexts fall back to `Tone.Recorder` (still works)
- If browser denies permission, check privacy settings

### Preset Won't Load?

- Ensure the JSON file is a valid preset (from "Save Preset" function)
- Check browser console for error messages
- Try saving a new preset and loading it as a test

### Crackling Audio?

- Reduce number of active voices or simplify pattern
- Lower filter resonance (Q) value
- Check system CPU usage

## Contributing

When modifying the codebase:

1. Maintain the single-file architecture (all code in HTML file)
2. Test audio on both HTTPS and HTTP contexts
3. Verify preset save/load functionality
4. Check responsive design on mobile
5. Update [AGENTS.md](AGENTS.md) with architectural changes
6. Save working versions to `Previous Versions/` before major changes

## File Structure

```
Web Arpeggiator/
├── README.md                    # This file
├── AGENTS.md                    # Architecture & development guide
├── Web Arpeggiator.html         # Main application (single file)
├── styles.css                   # External styles (optional)
├── presets/                     # Saved configurations
├── exports/                     # Generated audio
│   ├── realtime-recordings/
│   └── perfect-loops/
├── guides/                      # Documentation
├── images/                      # Assets
└── Previous Versions/           # Archive of working versions
```

## Performance

- **Responsive UI**: 30 Hz update rate for real-time feedback
- **Optimized Rendering**: Canvas visualizer scales for high-DPI displays
- **Efficient Synthesis**: Tone.js optimizations for polyphony
- **Master Limiter**: Prevents audio clipping at any parameter setting

## Future Enhancements

Potential features for future versions:

- MIDI input/output support
- Additional synth types (Noise, Membrane, Metal)
- Per-step velocity and probability controls
- Multi-track recording and mixing
- Chord voicing suggestions
- Browser local storage for auto-save
- Dark mode theme
- Additional effects (chorus, flanger, distortion)

## Credits

Built with:

- [Tone.js](https://tonejs.org/) for Web Audio synthesis
- [Tonal.js](https://github.com/tonaljs/tonal) for music theory
- [LameJS](https://www.npmjs.com/package/lamejs) for MP3 encoding
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Google Gemini API](https://deepmind.google/technologies/gemini/) for AI features (optional)

## License

This project is provided as-is for personal use and experimentation.

---

**Have questions or feedback?** Check [AGENTS.md](AGENTS.md) for technical details, or review the code in `Web Arpeggiator.html` directly—it's extensively documented!

**Ready to create?** Open `Web Arpeggiator.html` and start making music! 🎵

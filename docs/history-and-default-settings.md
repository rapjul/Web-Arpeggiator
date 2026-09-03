# History and Default Settings

Undo and redo operate on complete, serialized settings snapshots.
A snapshot is recorded whenever a supported setting changes, including changes made through a preset, URL preset, imported file, chord starter, randomizer, or virtual keyboard pattern addition.
The history keeps up to 100 prior snapshots and is saved with the last session.

Use `Ctrl`/`Cmd` + `Z` to undo.
Use `Ctrl`/`Cmd` + `Shift` + `Z` or `Ctrl`/`Cmd` + `Y` to redo.
These shortcuts take precedence over the virtual piano keyboard shortcuts.

## Undoable and Redoable Settings

The settings below are included in every history snapshot.
Reset All Defaults restores these values together and can itself be undone.

### Transport and Pattern

| Setting | Built-in default |
| --- | --- |
| BPM | 120. |
| Swing | 0.00. |
| Output gain | -6 dB. |
| Notes | C4 E4 G4. |
| Pattern direction | Up. |
| Note duration | 16n. |
| Gate length | 0.80. |
| Octave shift | 0. |
| Octave layers | 2. |
| Offline export loops | 4. |

The generated octave-expanded notes are included in snapshots as derived data; they are not a separate control.
With the default notes and two octave layers, the generated pattern contains C4, C5, E4, E5, G4, and G5.

### Scale

| Setting | Built-in default |
| --- | --- |
| Scale quantization | Enabled. |
| Scale root | C. |
| Scale type | Major. |

Scale quantization and scale type are reset together because they form one logical scale-mode setting.
Scale root is reset independently.

### Synth and Envelope

| Setting | Built-in default |
| --- | --- |
| Synth type | Basic Synth. |
| Waveform | Sine. |
| Duty cycle | 0.50. |
| Harmonicity | 3.0. |
| Modulation index | 10.0. |
| Attack | 0.01 s. |
| Decay | 0.10 s. |
| Sustain | 0.30. |
| Release | 0.50 s. |

### Synth-Specific Parameters

These values are preserved in history even when the associated synth type is not active.

| Setting | Built-in default |
| --- | --- |
| Mono Synth filter-envelope base | 300 Hz. |
| Mono Synth filter-envelope octaves | 4.0. |
| Mono Synth filter resonance | 2.0. |
| Duo Synth voice ratio | 1.50. |
| Duo Synth vibrato depth | 0.20. |
| Pluck Synth dampening | 4000 Hz. |
| Pluck Synth resonance | 0.90. |
| Pluck Synth attack noise | 1.0. |
| Membrane Synth pitch decay | 0.05 s. |
| Membrane Synth octaves | 8.0. |

### Filter and Effects

| Setting | Built-in default |
| --- | --- |
| Filter cutoff | 4000 Hz. |
| Filter resonance | 1.0. |
| Drive mix | 0.00. |
| Chorus mix | 0.00. |
| Auto-Pan mix | 0.00. |
| Delay mix | 0.20. |
| Reverb mix | 0.30. |

## Individual Resets

Double-click a setting label or its value readout to reset that logical setting to the built-in default.
Alternatively, focus the setting or its button group and press `Escape`.
Individual resets create an undoable snapshot.

The slider, text field, and select control themselves do not reset on double-click, so normal editing interactions remain unchanged.

## State Outside History

History deliberately excludes transient or non-serialized UI state: playback, recording, visualizer state, virtual keyboard state and mode, selected preset name, storage-management controls, and audio recordings or exports.

# Standard MIDI Specification & Implementation Reference

This document provides a technical overview of the Standard MIDI File (SMF 1.0) binary format and details how Web Arpeggiator implements native, zero-dependency MIDI export in [`../src/core/midi-export.js`](../src/core/midi-export.js).

MIDI is one output of the shared musical timeline in [`../src/core/timeline.js`](../src/core/timeline.js). Playback, loop previews, offline audio, and MIDI therefore use the same materialized note sequence and absolute event timing.

---

## 1. Official Standards & Specifications

For comprehensive specifications, refer to official standards published by the governing bodies:

- **[The MIDI Association (midi.org)](https://www.midi.org/)**: The authoritative organization managing MIDI specifications.
    - [Standard MIDI Files (SMF) 1.0 Specification](https://www.midi.org/specifications/item/standard-midi-files-smf)
    - [MIDI 1.0 Detailed Specification](https://www.midi.org/specifications-old/item/the-midi-1-0-specification)
    - [MIDI 2.0 Specifications](https://www.midi.org/specifications/midi-2-0-specifications)
- **[W3C Web MIDI API](https://www.w3.org/TR/webmidi/)**: Specification for browser-level access to hardware MIDI input and output ports.

> [!NOTE]
> **Copyright & Licensing Note:** The official MIDI specifications are copyrighted by the MIDI Association (formerly MMA / AMEI). Rather than bundling proprietary external PDFs into the repository, this project provides authoritative links alongside this technical summary of the format subset implemented in Web Arpeggiator.

---

## 2. SMF Format 0 Binary Architecture

Web Arpeggiator generates **Standard MIDI File Format 0** (`.mid`) files. Format 0 files contain a single track chunk holding all timing, tempo, meta, and channel voice events in sequential order.

### High-Level File Structure

```
+-------------------------------------------------------------+
| Header Chunk: 'MThd' (14 bytes)                             |
|  - Type (4 bytes): 'MThd' [0x4D, 0x54, 0x68, 0x64]          |
|  - Length (4 bytes): 6 [0x00, 0x00, 0x00, 0x06]             |
|  - Format (2 bytes): 0 [0x00, 0x00] (single track)          |
|  - Tracks (2 bytes): 1 [0x00, 0x01]                         |
|  - Division (2 bytes): 480 PPQ [0x01, 0xE0]                 |
+-------------------------------------------------------------+
| Track Chunk: 'MTrk' (8 + N bytes)                           |
|  - Type (4 bytes): 'MTrk' [0x4D, 0x54, 0x72, 0x6B]          |
|  - Length (4 bytes): N (track byte count, big-endian)       |
|  - Events Stream:                                           |
|      1. Time Signature Meta Event (4/4)                     |
|      2. Set Tempo Meta Event (Microseconds per beat)        |
|      3. Web Arpeggiator Sequencer-Specific Metadata         |
|      4. Sequenced Note-On & Note-Off Events with Delays     |
|      5. End of Track Meta Event                             |
+-------------------------------------------------------------+
```

---

## 3. Byte Encoding & Wire Details

### 3.1. Division / Time Resolution (PPQ)

The header specifies the division in **Ticks Per Quarter Note** (Pulses Per Quarter / PPQ).

- **Web Arpeggiator Division:** `480` ticks per beat (`0x01E0`).
- This high resolution guarantees exact subdivisions without floating-point rounding errors across all supported intervals:

| Interval  | Multiplier | Duration at 480 PPQ |
| :-------- | :--------- | :------------------ |
| **`64n`** | $1/16$     | $30\text{ ticks}$   |
| **`32n`** | $1/8$      | $60\text{ ticks}$   |
| **`16n`** | $1/4$      | $120\text{ ticks}$  |
| **`8n`**  | $1/2$      | $240\text{ ticks}$  |
| **`4n`**  | $1.0$      | $480\text{ ticks}$  |
| **`2n`**  | $2.0$      | $960\text{ ticks}$  |

---

### 3.2. Variable-Length Quantity (VLQ) Delta Times

Delta times represent the tick delay between the current event and the preceding event. In MIDI streams, all delta times are encoded as **Variable-Length Quantities (VLQ)**:

- Numbers are packed 7 bits per byte.
- The Most Significant Bit (MSB, `0x80`) is set to `1` on all bytes except the final byte, which has MSB `0`.

#### VLQ Encoding Table

| Decimal Value | Hexadecimal | VLQ Encoded Bytes (Hex) |
| :------------ | :---------- | :---------------------- |
| $0$           | `0x00`      | `0x00`                  |
| $64$          | `0x40`      | `0x40`                  |
| $127$         | `0x7F`      | `0x7F`                  |
| $128$         | `0x80`      | `0x81 0x00`             |
| $480$         | `0x01E0`    | `0x83 0x60`             |
| $16,383$      | `0x3FFF`    | `0xFF 0x7F`             |

---

### 3.3. Meta Events

Meta events provide sequence metadata. They begin with status byte `0xFF`, followed by a 1-byte meta-event type, a VLQ length descriptor, and event data bytes.

#### 1. Time Signature (`0x58`)

Sets time signature to 4/4 with 24 MIDI clocks per metronome click and eight 32nd notes per 24 clocks:

```
[Delta-Time: 0x00] 0xFF 0x58 0x04 0x04 0x02 0x18 0x08
```

- `0x04`: Numerator ($4$)
- `0x02`: Denominator as negative power of 2 ($2^2 = 4$)
- `0x18`: $24\text{ clocks}$ per quarter note
- `0x08`: Eight 32nd notes per quarter note

#### 2. Set Tempo (`0x51`)

Defines tempo in microseconds per quarter note ($\mu s/\text{beat}$):
$$\mu s/\text{beat} = \text{round}\left(\frac{60{,}000{,}000}{\text{BPM}}\right)$$

At 120 BPM:
$$\mu s/\text{beat} = \frac{60{,}000{,}000}{120} = 500{,}000\text{ (Hex: 0x07A120)}$$

```
[Delta-Time: 0x00] 0xFF 0x51 0x03 0x07 0xA1 0x20
```

#### 3. Sequencer-Specific Metadata (`0x7F`)

Stores a compact UTF-8 JSON payload identifying Web Arpeggiator and the normalized `randomSeed` used to materialize the pattern:

```json
{"application":"Web Arpeggiator","randomSeed":1831565813}
```

Sequencers that do not recognize this application-specific metadata can safely ignore it. The resolved MIDI notes remain self-contained, while seed-aware importers can recover the exact reproducibility setting.

#### 4. End of Track (`0x2F`)

Signals the termination of the track chunk:

```
[Delta-Time: remaining_rest_ticks] 0xFF 0x2F 0x00
```

---

### 3.4. Channel Voice Messages (Channel 0 / 1)

Web Arpeggiator writes note events on MIDI Channel 1 (Channel Index 0):

#### Note-On Event (`0x90`)

```
[Delta-Time (VLQ)] 0x90 [Note Number: 0-127] [Velocity: 1-127]
```

- Default velocity is $100$.

#### Note-Off Event (`0x80`)

```
[Delta-Time: Note Duration (VLQ)] 0x80 [Note Number: 0-127] [Release Velocity: 0x40]
```

- The Note-Off absolute tick is the compiled event start plus its effective gate duration. The duration is bounded by the next event start so a long gate cannot release after a later note has begun.
- Delta times are calculated after all absolute events are sorted. With swing enabled, the next Note-On delta reflects the compiled swing offset rather than assuming a fixed rest duration.

### 3.5. Shared Timeline Timing Contract

The timeline compiler uses integer ticks at 480 PPQ:

- Each supported interval maps to a fixed step length from 30 ticks (`64n`) through 960 ticks (`2n`).
- Pattern directions and scale quantization are materialized into one resolved cycle before events are emitted.
- Swing is applied to event start ticks using the same 8th-note subdivision model as Tone.Transport, then Tone transport swing remains `0` for consumers of the compiled events.
- Each event retains `sourceNoteIndex`, `sourceStepIndex`, `cycleIndex`, and `stepIndex`, allowing the UI and exports to refer back to the authored pattern.
- MIDI converts absolute event starts and ends into delta-time VLQs and emits Note-Off before Note-On when events share a tick.

---

### 3.6. Pitch to MIDI Note Number Mapping

MIDI assigns note number $60$ to Middle C ($C4$). The conversion formula for scientific pitch notation is:

$$\text{MIDI Note Number} = (\text{Octave} + 1) \times 12 + \text{Semitone Index}$$

| Pitch Name  | Semitone Index | Octave 3 (e.g. C3) | Octave 4 (Middle C) | Octave 5 (e.g. C5) |
| :---------- | :------------- | :----------------- | :------------------ | :----------------- |
| **C**       | 0              | 48                 | 60                  | 72                 |
| **C# / Db** | 1              | 49                 | 61                  | 73                 |
| **D**       | 2              | 50                 | 62                  | 74                 |
| **D# / Eb** | 3              | 51                 | 63                  | 75                 |
| **E**       | 4              | 52                 | 64                  | 76                 |
| **F**       | 5              | 53                 | 65                  | 77                 |
| **F# / Gb** | 6              | 54                 | 66                  | 78                 |
| **G**       | 7              | 55                 | 67                  | 79                 |
| **G# / Ab** | 8              | 56                 | 68                  | 80                 |
| **A**       | 9              | 57                 | 69 (A440)           | 81                 |
| **A# / Bb** | 10             | 58                 | 70                  | 82                 |
| **B**       | 11             | 59                 | 71                  | 83                 |

---

## 4. Module API (`src/core/midi-export.js`)

The [`../src/core/midi-export.js`](../src/core/midi-export.js) module exposes the following core functions:

- `noteNameToMidiNumber(noteName: string): number`
  Converts scientific pitch strings (e.g., `'C4'`, `'F#3'`) into bounded MIDI numbers (0–127).
- `encodeVariableLengthQuantity(value: number): number[]`
  Converts an integer into a 7-bit variable-length quantity byte array.
- `createMidiFileBytes(options: MidiExportOptions): Uint8Array`
  Encodes a complete SMF Format 0 file binary array with header, tempo/time signature meta events, and note events.
- `createMidiBlob(options: MidiExportOptions): Blob`
  Creates a downloadable `audio/midi` MIME type `Blob`.
- `exportMidiFile(options: MidiExportOptions, filename?: string): void`
  Triggers a direct browser file download for the `.mid` file.

---

## 5. Future Extensions

Potential future enhancements to the MIDI subsystem:

1. **Web MIDI API Integration**: Real-time MIDI clock synchronization and output to external hardware synthesizers/DAWs.
2. **SMF Format 1 Multi-Track Support**: Separating arpeggio patterns across independent melodic and bass channels.
3. **MIDI CC Automation**: Exporting filter cutoff and resonance envelopes as Continuous Controller (`0xB0`) curves.

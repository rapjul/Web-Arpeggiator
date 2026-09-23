import { downloadBlob } from "./audio-utils.js";
import { normalizeRandomSeed } from "./random-seed.js";
import { compileTimeline, TICKS_PER_BEAT } from "./timeline.js";
import { DEFAULT_BPM, MAX_BPM, MIN_BPM } from "./timing-constants.js";

/**
 * Standard MIDI File (.mid) Format 0 Binary Encoder and Pattern Export Utility.
 *
 * Implements pure binary encoding conforming to the Standard MIDI File Specification (SMF 1.0)
 * including variable-length quantity (VLQ) delta-time serialization, meta events (tempo, time signature),
 * and standard channel voice messages (Note-On / Note-Off).
 *
 * @module midi-export
 */

/**
 * Standard ticks per quarter note (PPQ / division) resolution.
 * @type {number}
 */
export { TICKS_PER_BEAT };

/**
 * Mapping of interval duration strings to beat multiplier ratios.
 * @type {Readonly<Record<string, number>>}
 */
export const INTERVAL_BEAT_MULTIPLIERS = Object.freeze({
    "64n": 0.0625, // 1/16 of a quarter note
    "32n": 0.125, // 1/8 of a quarter note
    "16n": 0.25, // 1/4 of a quarter note
    "8n": 0.5, // 1/2 of a quarter note
    "4n": 1.0, // 1 quarter note
    "2n": 2.0, // 2 quarter notes (half note)
});

/**
 * Natural pitch class semitone offset lookup (C=0, D=2, E=4, F=5, G=7, A=9, B=11).
 * @type {Readonly<Record<string, number>>}
 */
const NATURAL_SEMITONES = Object.freeze({
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
});

/**
 * Converts a musical pitch string (e.g. 'C4', 'F#3', 'Bb5', 'Cb4', 'E#4') into a standard MIDI note number (0–127).
 * MIDI standard: C4 = note number 60.
 * Accidental offsets (# = +1, b = -1) are applied to the natural note pitch,
 * correctly handling cross-octave enharmonics such as Cb4 (59) and B#3 (60).
 *
 * @param {string} noteName - Scientific pitch notation string.
 * @returns {number} The corresponding MIDI note number clamped between 0 and 127.
 */
export function noteNameToMidiNumber(noteName) {
    if (!noteName || typeof noteName !== "string") return 60;

    const match = noteName.trim().match(/^([A-Ga-g])([b#]?)(-?\d+)$/);
    if (!match) return 60;

    const natural = match[1].toUpperCase();
    const accidental = match[2];
    const octave = parseInt(match[3], 10);

    const naturalSemitone = NATURAL_SEMITONES[natural];
    if (naturalSemitone === undefined || !Number.isFinite(octave)) return 60;

    const accidentalOffset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
    // MIDI standard: C-1 is 0, C4 is 60 -> (octave + 1) * 12 + naturalSemitone + accidentalOffset
    const midiNum = (octave + 1) * 12 + naturalSemitone + accidentalOffset;
    return Math.min(Math.max(midiNum, 0), 127);
}

/**
 * Encodes an unsigned integer into a Variable-Length Quantity (VLQ) byte array.
 *
 * @param {number} value - Positive integer value to encode.
 * @returns {number[]} Array of bytes representing the VLQ.
 */
export function encodeVariableLengthQuantity(value) {
    let val = Math.max(0, Math.floor(value));
    const buffer = [];

    buffer.push(val & 0x7f);
    val >>= 7;

    while (val > 0) {
        buffer.push((val & 0x7f) | 0x80);
        val >>= 7;
    }

    return buffer.reverse();
}

/**
 * Converts a 32-bit unsigned integer into 4 big-endian bytes.
 *
 * @param {number} value - The 32-bit integer.
 * @returns {number[]} Array of 4 bytes.
 */
export function uint32ToBytes(value) {
    return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Converts a 16-bit unsigned integer into 2 big-endian bytes.
 *
 * @param {number} value - The 16-bit integer.
 * @returns {number[]} Array of 2 bytes.
 */
export function uint16ToBytes(value) {
    return [(value >> 8) & 0xff, value & 0xff];
}

/**
 * Builds a complete Standard MIDI File (Format 0) binary Uint8Array from arpeggiator pattern parameters.
 *
 * @param {object} [options={}] - Generation parameters.
 * @param {string[]} [options.notes] - Sequence of note names in playback order.
 * @param {number} [options.bpm=120] - Tempo in beats per minute.
 * @param {string} [options.interval='16n'] - Note duration interval string.
 * @param {number} [options.gateRatio=0.8] - Note gate duration ratio (0.05 to 1.0).
 * @param {number} [options.loopCount=1] - Number of times to loop the pattern in the export.
 * @param {number} [options.velocity=100] - Note-On MIDI velocity (1–127).
 * @param {number} [options.swing=0] - Swing amount from 0 through 1.
 * @param {number} [options.randomSeed] - Seed used to materialize and identify random patterns.
 * @param {import("./timeline.js").CompiledTimeline} [options.timeline] - Precompiled shared event timeline.
 * @returns {Uint8Array} Standard MIDI File binary data.
 */
export function createMidiFileBytes(options = {}) {
    const sourceOptions = options && typeof options === "object" ? options : {};
    const timeline =
        sourceOptions.timeline && Array.isArray(sourceOptions.timeline.events)
            ? sourceOptions.timeline
            : compileTimeline(
                  {
                      baseNotes: sourceOptions.notes ?? ["C4", "E4", "G4"],
                      direction: "up",
                      interval: sourceOptions.interval,
                      gateRatio: sourceOptions.gateRatio,
                      bpm: sourceOptions.bpm,
                      swing: sourceOptions.swing,
                      velocity: sourceOptions.velocity,
                      randomSeed: sourceOptions.randomSeed,
                  },
                  { cycles: sourceOptions.loopCount, terminalGatePolicy: "preserve" },
              );

    // Microseconds per quarter note for Set Tempo meta event (60,000,000 / BPM)
    const suppliedBpm = Number(timeline.bpm);
    const safeBpm = Number.isFinite(suppliedBpm)
        ? Math.min(Math.max(suppliedBpm, MIN_BPM), MAX_BPM)
        : DEFAULT_BPM;
    const microSecondsPerBeat = Math.round(60000000 / safeBpm);

    const trackEvents = [];

    // 1. Meta Event: Time Signature (4/4, 24 MIDI clocks per metronome tick, 8 32nd notes per 24 clocks)
    // Delta-time = 0
    trackEvents.push(
        ...encodeVariableLengthQuantity(0),
        0xff,
        0x58,
        0x04,
        0x04,
        0x02,
        0x18,
        0x08, // 4/4
    );

    // 2. Meta Event: Set Tempo
    // Delta-time = 0
    trackEvents.push(
        ...encodeVariableLengthQuantity(0),
        0xff,
        0x51,
        0x03,
        (microSecondsPerBeat >> 16) & 0xff,
        (microSecondsPerBeat >> 8) & 0xff,
        microSecondsPerBeat & 0xff,
    );

    // 3. Sequencer-Specific Meta Event containing reproducibility metadata.
    const metadataBytes = new TextEncoder().encode(
        JSON.stringify({
            application: "Web Arpeggiator",
            randomSeed: normalizeRandomSeed(timeline.randomSeed),
        }),
    );
    trackEvents.push(
        ...encodeVariableLengthQuantity(0),
        0xff,
        0x7f,
        ...encodeVariableLengthQuantity(metadataBytes.length),
        ...metadataBytes,
    );

    // 4. Note Events from the shared absolute-tick timeline.
    const midiEvents = [];
    timeline.events.forEach((event) => {
        const noteNum = noteNameToMidiNumber(event.pitch);
        const noteOnTick = Math.max(0, Math.trunc(event.startTick));
        const noteOffTick = noteOnTick + Math.max(1, Math.trunc(event.durationTicks));
        midiEvents.push({
            tick: noteOnTick,
            order: 1,
            bytes: [0x90, noteNum, event.velocity],
        });
        midiEvents.push({
            tick: noteOffTick,
            order: 0,
            bytes: [0x80, noteNum, 0x40],
        });
    });
    midiEvents.sort((left, right) => left.tick - right.tick || left.order - right.order);

    let cursorTick = 0;
    midiEvents.forEach((event) => {
        trackEvents.push(
            ...encodeVariableLengthQuantity(Math.max(0, event.tick - cursorTick)),
            ...event.bytes,
        );
        cursorTick = event.tick;
    });

    // 5. Meta Event: End of Track (00 FF 2F 00)
    trackEvents.push(
        ...encodeVariableLengthQuantity(Math.max(0, timeline.musicalDurationTicks - cursorTick)),
        0xff,
        0x2f,
        0x00,
    );

    // Assemble MIDI Chunks
    const headerChunk = [
        0x4d,
        0x54,
        0x68,
        0x64, // 'MThd'
        ...uint32ToBytes(6), // Header chunk length = 6
        ...uint16ToBytes(0), // Format 0 (single track)
        ...uint16ToBytes(1), // 1 track
        ...uint16ToBytes(TICKS_PER_BEAT), // Division (PPQ)
    ];

    const trackChunkHeader = [
        0x4d,
        0x54,
        0x72,
        0x6b, // 'MTrk'
        ...uint32ToBytes(trackEvents.length), // Track length in bytes
    ];

    const totalLength = headerChunk.length + trackChunkHeader.length + trackEvents.length;
    const midiBytes = new Uint8Array(totalLength);

    midiBytes.set(headerChunk, 0);
    midiBytes.set(trackChunkHeader, headerChunk.length);
    midiBytes.set(trackEvents, headerChunk.length + trackChunkHeader.length);

    return midiBytes;
}

/**
 * Creates a downloadable Standard MIDI File Blob from arpeggiator settings.
 *
 * @param {object} options - Arpeggiator pattern and timing parameters.
 * @returns {Blob} Standard MIDI file Blob with MIME type 'audio/midi'.
 */
export function createMidiBlob(options = {}) {
    const bytes = createMidiFileBytes(options);
    const buffer =
        bytes.buffer instanceof ArrayBuffer ? bytes.buffer : new Uint8Array(bytes).buffer;
    return new Blob([buffer], { type: "audio/midi" });
}

/**
 * Generates and triggers browser download of a Standard MIDI File (.mid).
 *
 * @param {object} options - Arpeggiator pattern parameters.
 * @param {string} [filename='arpeggio-pattern.mid'] - Target filename with or without .mid extension.
 * @returns {void}
 */
export function exportMidiFile(options, filename = "arpeggio-pattern.mid") {
    const blob = createMidiBlob(options);
    const safeFilename = filename.endsWith(".mid") ? filename : `${filename}.mid`;
    downloadBlob(blob, safeFilename);
}

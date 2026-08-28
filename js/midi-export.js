import { downloadBlob } from "./audio-utils.js";

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
export const TICKS_PER_BEAT = 480;

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
 * Note pitch name to semitone index lookup (chromatic C=0 to B=11).
 * @type {Readonly<Record<string, number>>}
 */
const NOTE_SEMITONES = Object.freeze({
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
});

/**
 * Converts a musical pitch string (e.g. 'C4', 'F#3', 'Bb5') into a standard MIDI note number (0–127).
 * MIDI standard: C4 = note number 60.
 *
 * @param {string} noteName - Scientific pitch notation string.
 * @returns {number} The corresponding MIDI note number clamped between 0 and 127.
 */
export function noteNameToMidiNumber(noteName) {
    if (!noteName || typeof noteName !== "string") return 60;

    const match = noteName.trim().match(/^([A-Ga-g][b#]?)(-?\d+)$/);
    if (!match) return 60;

    const pitch = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    const octave = parseInt(match[2], 10);

    const semitone = NOTE_SEMITONES[pitch] ?? 0;
    // MIDI standard: C-1 is 0, C4 is 60 -> (octave + 1) * 12 + semitone
    const midiNum = (octave + 1) * 12 + semitone;
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
 * @param {object} options - Generation parameters.
 * @param {string[]} options.notes - Sequence of note names in playback order.
 * @param {number} [options.bpm=120] - Tempo in beats per minute.
 * @param {string} [options.interval='16n'] - Note duration interval string.
 * @param {number} [options.gateRatio=0.8] - Note gate duration ratio (0.05 to 1.0).
 * @param {number} [options.loopCount=1] - Number of times to loop the pattern in the export.
 * @param {number} [options.velocity=100] - Note-On MIDI velocity (1–127).
 * @returns {Uint8Array} Standard MIDI File binary data.
 */
export function createMidiFileBytes(options) {
    const {
        notes = ["C4", "E4", "G4"],
        bpm = 120,
        interval = "16n",
        gateRatio = 0.8,
        loopCount = 1,
        velocity = 100,
    } = options || {};

    const safeBpm = Math.max(20, Math.min(300, bpm));
    const safeGate = Math.max(0.05, Math.min(1.0, gateRatio));
    const safeLoops = Math.max(1, Math.min(100, loopCount));
    const safeVelocity = Math.max(1, Math.min(127, Math.round(velocity)));

    const beatMultiplier = INTERVAL_BEAT_MULTIPLIERS[interval] ?? 0.25;
    const stepDurationTicks = Math.round(TICKS_PER_BEAT * beatMultiplier);
    const noteDurationTicks = Math.max(1, Math.round(stepDurationTicks * safeGate));
    const restDurationTicks = Math.max(0, stepDurationTicks - noteDurationTicks);

    // Microseconds per quarter note for Set Tempo meta event (60,000,000 / BPM)
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

    // 3. Note Events for each loop iteration
    const validNotes = Array.isArray(notes) && notes.length > 0 ? notes : ["C4"];

    for (let loop = 0; loop < safeLoops; loop++) {
        for (let i = 0; i < validNotes.length; i++) {
            const noteNum = noteNameToMidiNumber(validNotes[i]);

            // Note On (Channel 0): delta-time = 0 (on first note) or previous rest
            const onDeltaTime = loop === 0 && i === 0 ? 0 : restDurationTicks;
            trackEvents.push(
                ...encodeVariableLengthQuantity(onDeltaTime),
                0x90, // Note On, Channel 0
                noteNum,
                safeVelocity,
            );

            // Note Off (Channel 0): delta-time = note duration ticks
            trackEvents.push(
                ...encodeVariableLengthQuantity(noteDurationTicks),
                0x80, // Note Off, Channel 0
                noteNum,
                0x40, // standard release velocity
            );
        }
    }

    // 4. Meta Event: End of Track (00 FF 2F 00)
    // Add remaining rest of the last note before end of track
    trackEvents.push(...encodeVariableLengthQuantity(restDurationTicks), 0xff, 0x2f, 0x00);

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
export function createMidiBlob(options) {
    const bytes = createMidiFileBytes(options);
    return new Blob([bytes], { type: "audio/midi" });
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

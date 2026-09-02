/**
 * Pure domain module for generating scale-aware and chromatic chord note sequences.
 *
 * Fully decoupled from the DOM and Tone.js runtime to enable deterministic,
 * ultra-fast unit testing.
 *
 * @module chord-builder
 */

import * as Tonal from "tonal";

/**
 * Standard chord type definitions with relative semitone intervals and target octaves.
 * @type {Readonly<Record<string, { intervals: ReadonlyArray<number>, octave: number, name: string }>>}
 */
export const CHORD_DEFINITIONS = Object.freeze({
    major: {
        intervals: Object.freeze([0, 4, 7]),
        octave: 4,
        name: "Major",
    },
    minor: {
        intervals: Object.freeze([0, 3, 7]),
        octave: 4,
        name: "Minor",
    },
    dom7: {
        intervals: Object.freeze([0, 4, 7, 10]),
        octave: 4,
        name: "7th",
    },
    sus4: {
        intervals: Object.freeze([0, 5, 7]),
        octave: 4,
        name: "Sus4",
    },
    power: {
        intervals: Object.freeze([0, 7, 12]),
        octave: 3,
        name: "Power",
    },
    pentatonic: {
        intervals: Object.freeze([0, 2, 4, 7, 9]),
        octave: 4,
        name: "Pentatonic",
    },
});

/**
 * Resolves a chord definition while ignoring inherited object properties.
 *
 * @param {unknown} chordType - Candidate chord type identifier.
 * @returns {{ intervals: ReadonlyArray<number>, octave: number, name: string }} A supported chord definition.
 */
export function resolveChordDefinition(chordType) {
    return typeof chordType === "string" && Object.hasOwn(CHORD_DEFINITIONS, chordType)
        ? CHORD_DEFINITIONS[chordType]
        : CHORD_DEFINITIONS.major;
}

/**
 * Normalizes root formatting while preserving Tonal's valid pitch-class spelling (e.g. Db remains Db).
 *
 * @param {string} root - The root pitch name (e.g. "C", "Db", "F#").
 * @returns {string} Clean normalized root pitch class without octave.
 */
export function normalizeRootPitch(root) {
    if (typeof root !== "string" || root.trim().length === 0) {
        return "C";
    }

    const cleaned = root.trim().replace(/\s+/g, "");
    // Extract base letter and accidental only (allow optional digit octave, but reject trailing garbage)
    const match = cleaned.match(/^([A-Ga-g])([#b♯♭]?)(\d*)$/);
    if (!match) {
        return "C";
    }

    const letter = match[1].toUpperCase();
    const accidental = match[2] ? match[2].replace("♯", "#").replace("♭", "b") : "";
    const rawNote = `${letter}${accidental}`;

    const tonalNote = Tonal.Note.get(rawNote);
    if (!tonalNote || tonalNote.empty) {
        return "C";
    }

    return tonalNote.pc || "C";
}

/**
 * Generates an array of pitch strings for a given chord type and root note.
 *
 * @param {string} chordType - The chord type identifier (e.g. "major", "minor", "dom7", "sus4", "power", "pentatonic").
 * @param {string} [root="C"] - The root pitch note (e.g. "C", "D#", "Eb", "F#").
 * @param {number} [customOctave] - Optional octave override.
 * @returns {string[]} An array of scientific pitch strings (e.g. ["C4", "E4", "G4"]).
 */
export function buildChordNotes(chordType, root = "C", customOctave) {
    const normalizedRoot = normalizeRootPitch(root);
    const chordDef = resolveChordDefinition(chordType);
    const requestedOctave =
        typeof customOctave === "number" && Number.isInteger(customOctave)
            ? customOctave
            : chordDef.octave;

    const requestedRootMidi = Tonal.Midi.toMidi(`${normalizedRoot}${requestedOctave}`);
    const canUseRequestedOctave =
        requestedRootMidi !== null &&
        chordDef.intervals.every((semitoneOffset) => {
            const targetMidi = requestedRootMidi + semitoneOffset;
            return targetMidi >= 0 && targetMidi <= 127;
        });
    const baseOctave = canUseRequestedOctave ? requestedOctave : chordDef.octave;

    const rootMidi = Tonal.Midi.toMidi(`${normalizedRoot}${baseOctave}`);
    if (rootMidi === null) {
        return buildChordNotes("major", "C");
    }

    return chordDef.intervals.map((semitoneOffset) => {
        const targetMidi = rootMidi + semitoneOffset;
        const targetNote = Tonal.Midi.midiToNoteName(targetMidi, { sharps: true });
        return targetNote || `C${baseOctave}`;
    });
}

/**
 * Generates a space-separated note string ready for the #notes input.
 *
 * @param {string} chordType - The chord type identifier.
 * @param {string} [root="C"] - The root pitch note.
 * @param {number} [customOctave] - Optional octave override.
 * @returns {string} Space-separated note string (e.g. "C4 E4 G4").
 */
export function buildChordString(chordType, root = "C", customOctave) {
    const notes = buildChordNotes(chordType, root, customOctave);
    return notes.join(" ");
}

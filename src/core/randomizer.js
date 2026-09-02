/**
 * Pure domain module for generating musical random note sequences.
 *
 * Fully decoupled from the DOM and Tone.js runtime to enable deterministic,
 * ultra-fast unit testing.
 *
 * @module randomizer
 */

import * as Tonal from "tonal";
import { normalizeScaleType } from "@core/pattern-core.js";

/**
 * Default scale types selected when picking a musical scale for chromatic mode.
 * @type {ReadonlyArray<string>}
 */
export const DEFAULT_SCALE_FALLBACKS = Object.freeze([
    "major",
    "minor",
    "majorPentatonic",
    "minorPentatonic",
    "dorian",
    "mixolydian",
]);

/**
 * Options for configuring random note sequence generation.
 * @typedef {object} RandomizerOptions
 * @property {number[]} [octaves=[3, 4, 5]] - Array of allowed octave numbers.
 * @property {number} [minCount=4] - Minimum number of unique notes to generate.
 * @property {number} [maxCount=6] - Maximum number of unique notes to generate.
 * @property {string[]} [scaleFallbacks] - Scale types to pick from if scaleType is 'chromatic'.
 * @property {() => number} [rng=Math.random] - Random number generator function.
 */

/**
 * Generates a random, ascending sequence of unique notes based on root and scale type.
 *
 * @param {string} root - The scale root note (e.g. "C", "F#").
 * @param {string} scaleType - The scale type/mode (e.g. "minor", "mixolydian", "chromatic").
 * @param {RandomizerOptions} [options={}] - Custom configuration and random generator overrides.
 * @returns {string[]} An ascending array of note strings (e.g. ["C4", "E4", "G4"]).
 */
export function generateRandomNotes(root, scaleType, options = {}) {
    const {
        octaves = [3, 4, 5],
        minCount = 4,
        maxCount = 6,
        scaleFallbacks = DEFAULT_SCALE_FALLBACKS,
        rng = Math.random,
    } = options;

    const effectiveRoot = root || "C";
    let activeScaleType = normalizeScaleType(scaleType) || "major";

    if (activeScaleType === "chromatic") {
        const pickedIdx = Math.floor(rng() * scaleFallbacks.length);
        activeScaleType = normalizeScaleType(scaleFallbacks[pickedIdx]) || "major";
    }

    const scaleName = `${effectiveRoot} ${activeScaleType}`;
    const scale = Tonal.Scale.get(scaleName);
    let scalePitchClasses = scale?.notes;

    if (!scalePitchClasses || scalePitchClasses.length === 0) {
        scalePitchClasses = ["C", "D", "E", "G", "A"];
    }

    const notesPool = [];
    scalePitchClasses.forEach((pc) => {
        const simplifiedPc = Tonal.Note.simplify(pc) || pc;
        octaves.forEach((oct) => {
            notesPool.push(`${simplifiedPc}${oct}`);
        });
    });

    const countRange = Math.max(1, maxCount - minCount + 1);
    const count = Math.min(notesPool.length, Math.floor(rng() * countRange) + minCount);

    const selected = [];
    const tempPool = [...notesPool];

    for (let i = 0; i < count && tempPool.length > 0; i++) {
        const idx = Math.floor(rng() * tempPool.length);
        selected.push(tempPool.splice(idx, 1)[0]);
    }

    selected.sort((a, b) => {
        const aMidi = Tonal.Note.midi(a) ?? 0;
        const bMidi = Tonal.Note.midi(b) ?? 0;
        return aMidi - bMidi;
    });

    return selected;
}

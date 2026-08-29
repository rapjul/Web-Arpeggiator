/**
 * Pure domain module for Web Arpeggiator pattern generation,
 * musical scale quantization, octave arithmetic, and note marker calculations.
 *
 * This module is completely decoupled from the DOM and Web Audio hardware,
 * allowing it to be tested in isolation with maximum speed and reliability.
 *
 * @module pattern-core
 */

import * as Tonal from "tonal";

/**
 * Standard 12 chromatic pitch classes starting from C.
 * @type {ReadonlyArray<string>}
 */
export const CHROMATIC_PITCHES = Object.freeze([
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
]);

/**
 * Pre-calculated chromatic range from C0 to B8 used for pitch matching across octaves.
 * @type {ReadonlyArray<string>}
 */
export const CHROMATIC_RANGE = Object.freeze(
    (() => {
        const range = [];
        for (let octave = 0; octave < 9; octave++) {
            for (const note of CHROMATIC_PITCHES) {
                range.push(`${note}${octave}`);
            }
        }
        return range;
    })(),
);

/**
 * Parses a note string, resolving bare pitch classes without octaves to a default octave.
 *
 * @param {string} note - Input note string (e.g. "C", "c4", "f#", "Bb4").
 * @param {number} [defaultOctave=4] - Fallback octave number if omitted.
 * @returns {{name: string, midi: number}|null} Parsed note metadata or null if invalid.
 */
export function parseNoteWithOctave(note, defaultOctave = 4) {
    if (!note || typeof note !== "string") return null;
    const trimmed = note.trim();
    if (!trimmed) return null;

    let parsed = Tonal.Note.get(trimmed);
    if (parsed && typeof parsed.midi === "number") {
        return { name: parsed.name, midi: parsed.midi };
    }

    // If oct is null/undefined, try attaching defaultOctave
    const pc = Tonal.Note.pitchClass(trimmed);
    if (pc) {
        const withOct = `${pc}${defaultOctave}`;
        parsed = Tonal.Note.get(withOct);
        if (parsed && typeof parsed.midi === "number") {
            return { name: parsed.name, midi: parsed.midi };
        }
    }

    return null;
}

/**
 * Normalizes a note token to canonical scientific pitch notation (e.g. "c" -> "C4", "eb4" -> "Eb4").
 *
 * @param {string} note - Raw note token.
 * @param {number} [defaultOctave=4] - Fallback octave if omitted.
 * @returns {string|null} Canonical scientific pitch notation or null if unparseable.
 */
export function normalizeNoteName(note, defaultOctave = 4) {
    const parsed = parseNoteWithOctave(note, defaultOctave);
    return parsed ? parsed.name : null;
}

/**
 * Parses and normalizes a sequence of space-separated or array notes into canonical note strings.
 *
 * @param {string|string[]} notes - Space-separated note string or note array.
 * @param {number} [defaultOctave=4] - Fallback octave for bare pitch classes.
 * @returns {string[]} Array of normalized note strings.
 */
export function normalizeNotesSequence(notes, defaultOctave = 4) {
    if (!notes) return [];
    const tokens = Array.isArray(notes) ? notes : String(notes).trim().split(/\s+/);
    const normalized = [];
    for (const token of tokens) {
        if (!token) continue;
        const norm = normalizeNoteName(token, defaultOctave);
        if (norm) {
            normalized.push(norm);
        }
    }
    return normalized;
}

/**
 * Quantizes a list of notes to the closest matching pitches in a given scale.
 *
 * @param {string[]} baseNotes - Input note strings (e.g. ['C4', 'E4', 'G4']).
 * @param {string} root - Scale root note (e.g. 'C', 'F#').
 * @param {string} scaleType - Scale type identifier (e.g. 'major', 'minor', 'blues').
 * @returns {string[]} Quantized array of note strings.
 */
export function quantizeToScale(baseNotes, root, scaleType) {
    try {
        if (!root || !scaleType || !baseNotes || baseNotes.length === 0) {
            return baseNotes ? baseNotes.slice() : [];
        }

        if (scaleType === "chromatic") {
            return baseNotes.slice();
        }

        const scale = Tonal.Scale.get(`${root} ${scaleType}`);
        if (!scale?.notes || scale.notes.length === 0) {
            return baseNotes.slice();
        }

        const scalePitchClasses = scale.notes.map((n) => Tonal.Note.pitchClass(n));
        const scaleNotes = CHROMATIC_RANGE.filter((note) =>
            scalePitchClasses.includes(Tonal.Note.pitchClass(note)),
        );

        if (!scaleNotes.length) {
            return baseNotes.slice();
        }

        const scaleMidis = scaleNotes.map(Tonal.Note.midi);

        return baseNotes.map((note) => {
            try {
                const parsed = parseNoteWithOctave(note);
                if (!parsed || parsed.midi === undefined || parsed.midi === null) {
                    return note;
                }

                const closest = scaleMidis.reduce((prev, curr) =>
                    Math.abs(curr - parsed.midi) < Math.abs(prev - parsed.midi) ? curr : prev,
                );

                return Tonal.Note.fromMidi(closest);
            } catch {
                return note;
            }
        });
    } catch (e) {
        console.warn("quantizeToScale failed:", e);
        return baseNotes ? baseNotes.slice() : [];
    }
}

/**
 * Options for expanding base notes across octaves and quantization.
 * @typedef {object} NoteExpansionOptions
 * @property {number} [octaveRange=1] - Number of octaves to duplicate across (1 to 5).
 * @property {number} [octaveShift=0] - Octave transposition offset (-3 to 3).
 * @property {{enabled?: boolean, root?: string, scale?: string}} [quantize] - Scale quantization configuration.
 */

/**
 * Expands base notes across octave ranges and transpositions, and optionally quantizes them.
 *
 * @param {string[]} baseNotes - Input note strings.
 * @param {NoteExpansionOptions} [opts={}] - Expansion and quantization options.
 * @returns {string[]} Expanded array of note strings.
 */
export function getArpeggioNotes(baseNotes, opts = {}) {
    if (!baseNotes || baseNotes.length === 0) {
        return [];
    }

    const octaveRange = Math.max(1, Math.min(5, opts.octaveRange || 1));
    const octaveShift = Math.max(-3, Math.min(3, opts.octaveShift || 0));

    let expanded = [];
    for (let i = 0; i < baseNotes.length; i++) {
        const note = baseNotes[i];
        const parsed = parseNoteWithOctave(note);
        if (!parsed || parsed.midi === undefined) continue;

        for (let o = 0; o < octaveRange; o++) {
            const midi = parsed.midi + o * 12 + octaveShift * 12;
            expanded.push(Tonal.Note.fromMidi(midi));
        }
    }

    if (opts.quantize?.enabled && opts.quantize.root && opts.quantize.scale) {
        expanded = quantizeToScale(expanded, opts.quantize.root, opts.quantize.scale);
    }

    return expanded;
}

/**
 * Builds expanded notes along with a mapping of each note to its index in the original baseNotes.
 *
 * @param {string[]} baseNotes - Original input sequence of notes.
 * @param {number} octaveRange - Octave range (1 to 5).
 * @param {number} octaveShift - Octave shift (-3 to 3).
 * @param {{enabled?: boolean, root?: string, scale?: string}} [quantize] - Quantization options.
 * @returns {{notes: string[], map: number[]}} Expanded note strings and base index mappings.
 */
export function buildPatternNotesAndMap(baseNotes, octaveRange, octaveShift, quantize) {
    if (!baseNotes || baseNotes.length === 0) {
        return { notes: [], map: [] };
    }

    const validRange = Math.max(1, Math.min(5, octaveRange || 1));
    const validShift = Math.max(-3, Math.min(3, octaveShift || 0));

    const notes = [];
    const map = [];

    for (let i = 0; i < baseNotes.length; i++) {
        const note = baseNotes[i];
        const parsed = parseNoteWithOctave(note);
        if (!parsed || parsed.midi === undefined) continue;

        for (let o = 0; o < validRange; o++) {
            const midi = parsed.midi + o * 12 + validShift * 12;
            notes.push(Tonal.Note.fromMidi(midi));
            map.push(i);
        }
    }

    if (quantize?.enabled && quantize.root && quantize.scale) {
        const quantized = quantizeToScale(notes, quantize.root, quantize.scale);
        return { notes: quantized, map };
    }

    return { notes, map };
}

/**
 * Result of building a pattern sequence.
 * @typedef {object} PatternSequenceResult
 * @property {string[]} finalNotes - Final ordered note sequence to schedule.
 * @property {number[]} stepToBaseIndexMap - Array mapping each step index back to the base note index.
 * @property {import('../types.d.ts').TonePatternDirection} finalDirection - Direction identifier passed to Tone.Pattern (e.g. 'up', 'down', 'random').
 */

/**
 * Generates the note sequence, step mapping, and Tone.Pattern direction for any of the 12 supported pattern modes.
 *
 * @param {string[]} baseNotes - Input note strings.
 * @param {object} options - Configuration options.
 * @param {string} [options.direction='up'] - One of the 12 supported pattern directions.
 * @param {number} [options.octaveRange=1] - Octave range (1 to 5).
 * @param {number} [options.octaveShift=0] - Octave shift (-3 to 3).
 * @param {{enabled?: boolean, root?: string, scale?: string}} [options.quantize] - Quantization options.
 * @param {() => number} [options.rng=Math.random] - Optional random number generator for deterministic testing.
 * @returns {PatternSequenceResult} Computed pattern sequence result.
 */
export function buildPatternSequence(baseNotes, options = {}) {
    const {
        direction = "up",
        octaveRange = 1,
        octaveShift = 0,
        quantize = { enabled: false, root: "C", scale: "major" },
        rng = Math.random,
    } = options;

    if (!baseNotes || baseNotes.length === 0) {
        return { finalNotes: [], stepToBaseIndexMap: [], finalDirection: "up" };
    }

    let finalNotes = [];
    /** @type {import("../types.d.ts").TonePatternDirection} */
    let finalDirection = "up";
    let stepToBaseIndexMap = [];

    if (direction === "upDownRepeat") {
        const { notes, map } = buildPatternNotesAndMap(
            baseNotes,
            octaveRange,
            octaveShift,
            quantize,
        );
        if (notes.length > 0) {
            const reversedNotes = [...notes].reverse();
            const reversedMap = [...map].reverse();
            finalNotes = [...notes, ...reversedNotes];
            stepToBaseIndexMap = [...map, ...reversedMap];
            finalDirection = "up";
        }
    } else if (direction === "downUpRepeat") {
        const { notes, map } = buildPatternNotesAndMap(
            baseNotes,
            octaveRange,
            octaveShift,
            quantize,
        );
        if (notes.length > 0) {
            const reversedNotes = [...notes].reverse();
            const reversedMap = [...map].reverse();
            finalNotes = [...reversedNotes, ...notes];
            stepToBaseIndexMap = [...reversedMap, ...map];
            finalDirection = "up";
        }
    } else if (direction === "octaveCycle") {
        const quantizedBaseNotes = quantize?.enabled
            ? quantizeToScale(baseNotes, quantize.root, quantize.scale)
            : baseNotes;

        quantizedBaseNotes.forEach((baseNote, i) => {
            const parsed = parseNoteWithOctave(baseNote);
            if (!parsed || parsed.midi === undefined) return;
            for (let rep = 0; rep < 2; rep++) {
                for (let oct = 0; oct < 3; oct++) {
                    const midi = parsed.midi + octaveShift * 12 + oct * 12;
                    finalNotes.push(Tonal.Note.fromMidi(midi));
                    stepToBaseIndexMap.push(i);
                }
            }
        });
        finalDirection = "up";
    } else if (direction === "octaveCycleReverse") {
        const quantizedBaseNotes = quantize?.enabled
            ? quantizeToScale(baseNotes, quantize.root, quantize.scale)
            : baseNotes;

        const indexedNotes = quantizedBaseNotes.map((note, index) => ({
            note,
            index,
        }));
        const reversedIndexed = [...indexedNotes].reverse();

        reversedIndexed.forEach(({ note, index }) => {
            const parsed = parseNoteWithOctave(note);
            if (!parsed || parsed.midi === undefined) return;
            for (let rep = 0; rep < 2; rep++) {
                for (let oct = 2; oct >= 0; oct--) {
                    const midi = parsed.midi + octaveShift * 12 + oct * 12;
                    finalNotes.push(Tonal.Note.fromMidi(midi));
                    stepToBaseIndexMap.push(index);
                }
            }
        });
        finalDirection = "up";
    } else if (direction === "octaveCyclePingPong") {
        const quantizedBaseNotes = quantize?.enabled
            ? quantizeToScale(baseNotes, quantize.root, quantize.scale)
            : baseNotes;

        quantizedBaseNotes.forEach((baseNote, i) => {
            const parsed = parseNoteWithOctave(baseNote);
            if (!parsed || parsed.midi === undefined) return;

            // Up: 0, 1, 2
            for (let oct = 0; oct < 3; oct++) {
                const midi = parsed.midi + octaveShift * 12 + oct * 12;
                finalNotes.push(Tonal.Note.fromMidi(midi));
                stepToBaseIndexMap.push(i);
            }
            // Down: 1, 0
            for (let oct = 1; oct >= 0; oct--) {
                const midi = parsed.midi + octaveShift * 12 + oct * 12;
                finalNotes.push(Tonal.Note.fromMidi(midi));
                stepToBaseIndexMap.push(i);
            }
            // Up again: 1, 2
            for (let oct = 1; oct < 3; oct++) {
                const midi = parsed.midi + octaveShift * 12 + oct * 12;
                finalNotes.push(Tonal.Note.fromMidi(midi));
                stepToBaseIndexMap.push(i);
            }
        });
        finalDirection = "up";
    } else if (direction === "randomWalkDrunk") {
        const { notes, map } = buildPatternNotesAndMap(
            baseNotes,
            octaveRange,
            octaveShift,
            quantize,
        );
        if (notes.length > 0) {
            let currentIndex = Math.floor(rng() * notes.length);
            finalNotes.push(notes[currentIndex]);
            stepToBaseIndexMap.push(map[currentIndex]);

            for (let i = 1; i < 16; i++) {
                let step;
                if (rng() < 0.8) {
                    step = rng() > 0.5 ? 1 : -1;
                } else {
                    step = Math.floor(rng() * 7) - 3;
                    if (step === 0) step = 1;
                }

                currentIndex =
                    (((currentIndex + step) % notes.length) + notes.length) % notes.length;
                finalNotes.push(notes[currentIndex]);
                stepToBaseIndexMap.push(map[currentIndex]);
            }
            finalDirection = "up";
        }
    } else {
        // Standard directions: 'up', 'down', 'upDown', 'downUp', 'random', 'randomWalk'
        const { notes, map } = buildPatternNotesAndMap(
            baseNotes,
            octaveRange,
            octaveShift,
            quantize,
        );
        finalNotes = notes;
        stepToBaseIndexMap = map;
        finalDirection = /** @type {import("../types.d.ts").TonePatternDirection} */ (direction);
    }

    return {
        finalNotes,
        stepToBaseIndexMap,
        finalDirection,
    };
}

/**
 * Materializes a finite sequence of notes and base index mappings according to the selected pattern direction.
 *
 * Unlike buildPatternSequence which defers standard directions ('down', 'upDown', 'downUp', 'random', 'randomWalk')
 * to Tone.Pattern traversal during playback, this function unrolls all 12 directions deterministically into a
 * finite concrete sequence suitable for Standard MIDI export, offline renderers, and static timeline mapping.
 *
 * @param {string[]} baseNotes - Input note strings.
 * @param {object} [options={}] - Configuration options.
 * @param {string} [options.direction='up'] - One of the 12 supported pattern directions.
 * @param {number} [options.octaveRange=1] - Octave range (1 to 5).
 * @param {number} [options.octaveShift=0] - Octave shift (-3 to 3).
 * @param {{enabled?: boolean, root?: string, scale?: string}} [options.quantize] - Quantization options.
 * @param {() => number} [options.rng=Math.random] - Optional random number generator for deterministic unrolling.
 * @returns {{notes: string[], map: number[]}} Unrolled note sequence and base note index map.
 */
export function materializePatternSequence(baseNotes, options = {}) {
    const {
        direction = "up",
        octaveRange = 1,
        octaveShift = 0,
        quantize = { enabled: false, root: "C", scale: "major" },
        rng = Math.random,
    } = options;

    if (!baseNotes || baseNotes.length === 0) {
        return { notes: [], map: [] };
    }

    const { notes, map } = buildPatternNotesAndMap(baseNotes, octaveRange, octaveShift, quantize);

    if (notes.length === 0) {
        return { notes: [], map: [] };
    }

    let finalNotes = [];
    let finalMap = [];

    switch (direction) {
        case "up":
            finalNotes = [...notes];
            finalMap = [...map];
            break;
        case "down":
            finalNotes = [...notes].reverse();
            finalMap = [...map].reverse();
            break;
        case "upDown":
            if (notes.length <= 2) {
                finalNotes = [...notes];
                finalMap = [...map];
            } else {
                const downNotes = notes.slice(1, -1).reverse();
                const downMap = map.slice(1, -1).reverse();
                finalNotes = [...notes, ...downNotes];
                finalMap = [...map, ...downMap];
            }
            break;
        case "downUp":
            if (notes.length <= 2) {
                finalNotes = [...notes].reverse();
                finalMap = [...map].reverse();
            } else {
                const reversedNotes = [...notes].reverse();
                const reversedMap = [...map].reverse();
                const upNotes = notes.slice(1, -1);
                const upMap = map.slice(1, -1);
                finalNotes = [...reversedNotes, ...upNotes];
                finalMap = [...reversedMap, ...upMap];
            }
            break;
        case "upDownRepeat":
            finalNotes = [...notes, ...[...notes].reverse()];
            finalMap = [...map, ...[...map].reverse()];
            break;
        case "downUpRepeat":
            finalNotes = [...[...notes].reverse(), ...notes];
            finalMap = [...[...map].reverse(), ...map];
            break;
        case "octaveCycle": {
            const quantizedBaseNotes = quantize?.enabled
                ? quantizeToScale(baseNotes, quantize.root, quantize.scale)
                : baseNotes;
            quantizedBaseNotes.forEach((baseNote, i) => {
                const parsed = parseNoteWithOctave(baseNote);
                if (!parsed || parsed.midi === undefined) return;
                for (let rep = 0; rep < 2; rep++) {
                    for (let oct = 0; oct < 3; oct++) {
                        finalNotes.push(
                            Tonal.Note.fromMidi(parsed.midi + octaveShift * 12 + oct * 12),
                        );
                        finalMap.push(i);
                    }
                }
            });
            break;
        }
        case "octaveCycleReverse": {
            const quantizedBaseNotes = quantize?.enabled
                ? quantizeToScale(baseNotes, quantize.root, quantize.scale)
                : baseNotes;
            const indexed = [...quantizedBaseNotes]
                .map((note, index) => ({ note, index }))
                .reverse();
            indexed.forEach(({ note, index }) => {
                const parsed = parseNoteWithOctave(note);
                if (!parsed || parsed.midi === undefined) return;
                for (let rep = 0; rep < 2; rep++) {
                    for (let oct = 2; oct >= 0; oct--) {
                        finalNotes.push(
                            Tonal.Note.fromMidi(parsed.midi + octaveShift * 12 + oct * 12),
                        );
                        finalMap.push(index);
                    }
                }
            });
            break;
        }
        case "octaveCyclePingPong": {
            const quantizedBaseNotes = quantize?.enabled
                ? quantizeToScale(baseNotes, quantize.root, quantize.scale)
                : baseNotes;
            quantizedBaseNotes.forEach((baseNote, i) => {
                const parsed = parseNoteWithOctave(baseNote);
                if (!parsed || parsed.midi === undefined) return;
                for (let oct = 0; oct < 3; oct++) {
                    finalNotes.push(Tonal.Note.fromMidi(parsed.midi + octaveShift * 12 + oct * 12));
                    finalMap.push(i);
                }
                for (let oct = 1; oct >= 0; oct--) {
                    finalNotes.push(Tonal.Note.fromMidi(parsed.midi + octaveShift * 12 + oct * 12));
                    finalMap.push(i);
                }
                for (let oct = 1; oct < 3; oct++) {
                    finalNotes.push(Tonal.Note.fromMidi(parsed.midi + octaveShift * 12 + oct * 12));
                    finalMap.push(i);
                }
            });
            break;
        }
        case "random": {
            const count = Math.max(1, notes.length);
            for (let i = 0; i < count; i++) {
                const idx = Math.floor(rng() * notes.length);
                finalNotes.push(notes[idx]);
                finalMap.push(map[idx]);
            }
            break;
        }
        case "randomWalk": {
            const count = Math.max(1, notes.length);
            let idx = Math.floor(rng() * notes.length);
            finalNotes.push(notes[idx]);
            finalMap.push(map[idx]);
            for (let i = 1; i < count; i++) {
                const step = rng() > 0.5 ? 1 : -1;
                idx = (((idx + step) % notes.length) + notes.length) % notes.length;
                finalNotes.push(notes[idx]);
                finalMap.push(map[idx]);
            }
            break;
        }
        case "randomWalkDrunk": {
            let currentIndex = Math.floor(rng() * notes.length);
            finalNotes.push(notes[currentIndex]);
            finalMap.push(map[currentIndex]);
            for (let i = 1; i < 16; i++) {
                let step;
                if (rng() < 0.8) {
                    step = rng() > 0.5 ? 1 : -1;
                } else {
                    step = Math.floor(rng() * 7) - 3;
                    if (step === 0) step = 1;
                }
                currentIndex =
                    (((currentIndex + step) % notes.length) + notes.length) % notes.length;
                finalNotes.push(notes[currentIndex]);
                finalMap.push(map[currentIndex]);
            }
            break;
        }
        default:
            finalNotes = [...notes];
            finalMap = [...map];
            break;
    }

    return {
        notes: finalNotes,
        map: finalMap,
    };
}

/**
 * Note trigger marker descriptor for loop mapping and visualizer timelines.
 * @typedef {object} NoteMarker
 * @property {string} note - Pitch string (e.g. 'C4').
 * @property {number} timeRatio - Normalized time ratio from 0.0 to 1.0 within the loop.
 */

/**
 * Calculates normalized note trigger positions across a single arpeggio loop cycle.
 *
 * @param {object} settings - Application settings snapshot.
 * @param {string[]} settings.baseNotes - Base note strings.
 * @param {number} [settings.octaveRange=1] - Octave range (1 to 5).
 * @param {number} [settings.octaveShift=0] - Octave shift (-3 to 3).
 * @param {boolean} [settings.scaleQuantize=false] - Whether scale quantization is enabled.
 * @param {string} [settings.scaleRoot='C'] - Scale root note.
 * @param {string} [settings.scaleType='major'] - Scale type.
 * @param {string} [settings.direction='up'] - Pattern direction mode.
 * @returns {NoteMarker[]} Ordered array of note triggers and normalized timestamps.
 */
export function calculateNoteMarkers(settings) {
    if (!settings?.baseNotes || settings.baseNotes.length === 0) {
        return [];
    }

    const {
        baseNotes,
        octaveRange = 1,
        octaveShift = 0,
        scaleQuantize = false,
        scaleRoot = "C",
        scaleType = "major",
        direction = "up",
    } = settings;

    const { notes } = materializePatternSequence(baseNotes, {
        direction,
        octaveRange,
        octaveShift,
        quantize: {
            enabled: scaleQuantize,
            root: scaleRoot,
            scale: scaleType,
        },
    });

    if (notes.length === 0) {
        return [];
    }

    return notes.map((note, idx) => ({
        note,
        timeRatio: idx / notes.length,
    }));
}

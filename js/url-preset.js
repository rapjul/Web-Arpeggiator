/**
 * Pure domain module for serializing and deserializing preset settings to/from URL search parameters.
 *
 * Implements strict boundary validation, parameter clamping, and change-detection logic
 * completely independent of the browser DOM or window objects.
 *
 * @module url-preset
 */

import { normalizeNotesSequence } from "./pattern-core.js";

/**
 * Recognized query parameter keys mapped to preset settings.
 * @type {ReadonlySet<string>}
 */
export const PRESET_URL_KEYS = Object.freeze(
    new Set([
        "bpm",
        "swing",
        "gain",
        "notes",
        "dir",
        "int",
        "quant",
        "root",
        "scale",
        "synth",
        "wave",
        "harm",
        "mod",
        "duty",
        "gate",
        "shift",
        "range",
        "attack",
        "decay",
        "sustain",
        "release",
        "cutoff",
        "res",
        "drive",
        "chorus",
        "pan",
        "delay",
        "reverb",
        "loop",
    ]),
);

/**
 * Allowed pattern direction slugs.
 * @type {ReadonlyArray<string>}
 */
export const ALLOWED_DIRECTIONS = Object.freeze([
    "up",
    "down",
    "upDown",
    "downUp",
    "upDownRepeat",
    "downUpRepeat",
    "random",
    "octaveCycle",
    "octaveCycleReverse",
    "octaveCyclePingPong",
    "randomWalk",
    "randomWalkDrunk",
]);

/**
 * Allowed note intervals.
 * @type {ReadonlyArray<string>}
 */
export const ALLOWED_INTERVALS = Object.freeze(["64n", "32n", "16n", "8n", "4n", "2n"]);

/**
 * Allowed scale root notes.
 * @type {ReadonlyArray<string>}
 */
export const ALLOWED_ROOTS = Object.freeze([
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
 * Allowed scale types.
 * @type {ReadonlyArray<string>}
 */
export const ALLOWED_SCALES = Object.freeze([
    "major",
    "minor",
    "harmonic minor",
    "melodic minor",
    "dorian",
    "phrygian",
    "lydian",
    "mixolydian",
    "locrian",
    "blues",
    "chromatic",
]);

/**
 * Allowed synth types.
 * @type {ReadonlyArray<string>}
 */
export const ALLOWED_SYNTHS = Object.freeze([
    "synth",
    "fmSynth",
    "amSynth",
    "monoSynth",
    "duoSynth",
    "pluckSynth",
    "membraneSynth",
]);

/**
 * Allowed waveform types.
 * @type {ReadonlyArray<string>}
 */
export const ALLOWED_WAVEFORMS = Object.freeze(["sine", "square", "sawtooth", "triangle", "pulse"]);

/**
 * Regular expression to validate space-separated note sequences with optional octaves and case-insensitivity (e.g. "C4 E4 G4", "c e g", "C#4 Eb5").
 * @type {RegExp}
 */
export const NOTES_REGEX = /^[A-Ga-g][b#]?[0-9]?(\s+[A-Ga-g][b#]?[0-9]?)*$/;

/**
 * Parses and clamps an integer value between minimum and maximum bounds.
 *
 * @param {string|null} val - Raw string value to parse.
 * @param {number} min - Inclusive minimum value.
 * @param {number} max - Inclusive maximum value.
 * @param {number} fallback - Fallback value if parsing fails.
 * @returns {number} The clamped integer.
 */
export function clampInt(val, min, max, fallback) {
    if (val === null || val === undefined) return fallback;
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

/**
 * Parses and clamps a floating-point value between minimum and maximum bounds.
 *
 * @param {string|null} val - Raw string value to parse.
 * @param {number} min - Inclusive minimum value.
 * @param {number} max - Inclusive maximum value.
 * @param {number} fallback - Fallback value if parsing fails.
 * @returns {number} The clamped float.
 */
export function clampFloat(val, min, max, fallback) {
    if (val === null || val === undefined) return fallback;
    const parsed = parseFloat(val);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

/**
 * Serializes a full settings snapshot into URL search parameters.
 *
 * @param {object} settings - Application settings object.
 * @returns {URLSearchParams} Encoded URL search parameters.
 */
export function serializePresetToUrlParams(settings) {
    const params = new URLSearchParams();

    if (!settings) return params;

    if (Array.isArray(settings.baseNotes) && settings.baseNotes.length > 0) {
        const normalized = normalizeNotesSequence(settings.baseNotes);
        if (normalized.length > 0) {
            params.set("notes", normalized.join(" "));
        }
    }
    if (settings.bpm !== undefined) params.set("bpm", String(settings.bpm));
    if (settings.swing !== undefined) params.set("swing", Number(settings.swing).toFixed(2));
    if (settings.postGain !== undefined) params.set("gain", Number(settings.postGain).toFixed(0));
    if (settings.direction) params.set("dir", settings.direction);
    if (settings.interval) params.set("int", settings.interval);
    if (settings.scaleQuantize !== undefined)
        params.set("quant", settings.scaleQuantize ? "true" : "false");
    if (settings.scaleRoot) params.set("root", settings.scaleRoot);
    if (settings.scaleType) params.set("scale", settings.scaleType);
    if (settings.synthType) params.set("synth", settings.synthType);
    if (settings.waveform) params.set("wave", settings.waveform);
    if (settings.harmonicity !== undefined)
        params.set("harm", Number(settings.harmonicity).toFixed(1));
    if (settings.modulationIndex !== undefined)
        params.set("mod", Number(settings.modulationIndex).toFixed(1));
    if (settings.dutyCycle !== undefined) params.set("duty", Number(settings.dutyCycle).toFixed(2));
    if (settings.gateRatio !== undefined) params.set("gate", Number(settings.gateRatio).toFixed(2));
    if (settings.octaveShift !== undefined) params.set("shift", String(settings.octaveShift));
    if (settings.octaveRange !== undefined) params.set("range", String(settings.octaveRange));
    if (settings.envAttack !== undefined)
        params.set("attack", Number(settings.envAttack).toFixed(2));
    if (settings.envDecay !== undefined) params.set("decay", Number(settings.envDecay).toFixed(2));
    if (settings.envSustain !== undefined)
        params.set("sustain", Number(settings.envSustain).toFixed(2));
    if (settings.envRelease !== undefined)
        params.set("release", Number(settings.envRelease).toFixed(2));
    if (settings.filterCutoff !== undefined)
        params.set("cutoff", Number(settings.filterCutoff).toFixed(0));
    if (settings.filterResonance !== undefined)
        params.set("res", Number(settings.filterResonance).toFixed(1));
    if (settings.driveMix !== undefined) params.set("drive", Number(settings.driveMix).toFixed(2));
    if (settings.chorusMix !== undefined)
        params.set("chorus", Number(settings.chorusMix).toFixed(2));
    if (settings.autoPanMix !== undefined)
        params.set("pan", Number(settings.autoPanMix).toFixed(2));
    if (settings.delayMix !== undefined) params.set("delay", Number(settings.delayMix).toFixed(2));
    if (settings.reverbMix !== undefined)
        params.set("reverb", Number(settings.reverbMix).toFixed(2));
    if (settings.loopCount !== undefined) params.set("loop", String(settings.loopCount));

    return params;
}

/**
 * Parses and strictly validates preset search parameters against default or current settings.
 *
 * @param {URLSearchParams|string} searchParams - URL search parameters instance or query string.
 * @param {object} currentSettings - Current baseline application settings.
 * @returns {object|null} Updated settings object if any preset keys were recognized, or null otherwise.
 */
export function parsePresetFromUrlParams(searchParams, currentSettings) {
    const params =
        typeof searchParams === "string" ? new URLSearchParams(searchParams) : searchParams;

    if (!params) return null;

    const hasRecognizedKey = [...params.keys()].some((k) => PRESET_URL_KEYS.has(k));
    if (!hasRecognizedKey) return null;

    const settings = { ...currentSettings };

    if (params.has("notes")) {
        const rawNotes = params.get("notes")?.trim() || "";
        if (NOTES_REGEX.test(rawNotes)) {
            const normalized = normalizeNotesSequence(rawNotes);
            if (normalized.length > 0) {
                settings.baseNotes = normalized;
            }
        }
    }

    if (params.has("bpm")) settings.bpm = clampInt(params.get("bpm"), 40, 240, settings.bpm);
    if (params.has("swing"))
        settings.swing = clampFloat(params.get("swing"), 0.0, 1.0, settings.swing);
    if (params.has("gain"))
        settings.postGain = clampFloat(params.get("gain"), -40.0, 0.0, settings.postGain);

    if (params.has("dir")) {
        const dir = params.get("dir");
        if (dir && ALLOWED_DIRECTIONS.includes(dir)) settings.direction = dir;
    }

    if (params.has("int")) {
        const interval = params.get("int");
        if (interval && ALLOWED_INTERVALS.includes(interval)) settings.interval = interval;
    }

    if (params.has("quant")) {
        settings.scaleQuantize = params.get("quant") === "true";
    }

    if (params.has("root")) {
        const root = params.get("root");
        if (root && ALLOWED_ROOTS.includes(root)) settings.scaleRoot = root;
    }

    if (params.has("scale")) {
        const scale = params.get("scale");
        if (scale && ALLOWED_SCALES.includes(scale)) settings.scaleType = scale;
    }

    if (params.has("synth")) {
        const synth = params.get("synth");
        if (synth && ALLOWED_SYNTHS.includes(synth)) settings.synthType = synth;
    }

    if (params.has("wave")) {
        const wave = params.get("wave");
        if (wave && ALLOWED_WAVEFORMS.includes(wave)) settings.waveform = wave;
    }

    if (params.has("harm"))
        settings.harmonicity = clampFloat(params.get("harm"), 0.5, 10.0, settings.harmonicity);
    if (params.has("mod"))
        settings.modulationIndex = clampFloat(
            params.get("mod"),
            1.0,
            50.0,
            settings.modulationIndex,
        );
    if (params.has("duty"))
        settings.dutyCycle = clampFloat(params.get("duty"), 0.01, 0.99, settings.dutyCycle);
    if (params.has("gate"))
        settings.gateRatio = clampFloat(params.get("gate"), 0.05, 1.0, settings.gateRatio);
    if (params.has("shift"))
        settings.octaveShift = clampInt(params.get("shift"), -3, 3, settings.octaveShift);
    if (params.has("range"))
        settings.octaveRange = clampInt(params.get("range"), 1, 5, settings.octaveRange);
    if (params.has("attack"))
        settings.envAttack = clampFloat(params.get("attack"), 0.0, 2.0, settings.envAttack);
    if (params.has("decay"))
        settings.envDecay = clampFloat(params.get("decay"), 0.0, 2.0, settings.envDecay);
    if (params.has("sustain"))
        settings.envSustain = clampFloat(params.get("sustain"), 0.0, 1.0, settings.envSustain);
    if (params.has("release"))
        settings.envRelease = clampFloat(params.get("release"), 0.0, 5.0, settings.envRelease);
    if (params.has("cutoff"))
        settings.filterCutoff = clampFloat(
            params.get("cutoff"),
            100.0,
            10000.0,
            settings.filterCutoff,
        );
    if (params.has("res"))
        settings.filterResonance = clampFloat(
            params.get("res"),
            0.0,
            20.0,
            settings.filterResonance,
        );
    if (params.has("drive"))
        settings.driveMix = clampFloat(params.get("drive"), 0.0, 1.0, settings.driveMix ?? 0);
    if (params.has("chorus"))
        settings.chorusMix = clampFloat(params.get("chorus"), 0.0, 1.0, settings.chorusMix ?? 0);
    if (params.has("pan"))
        settings.autoPanMix = clampFloat(params.get("pan"), 0.0, 1.0, settings.autoPanMix ?? 0);
    if (params.has("delay"))
        settings.delayMix = clampFloat(params.get("delay"), 0.0, 1.0, settings.delayMix);
    if (params.has("reverb"))
        settings.reverbMix = clampFloat(params.get("reverb"), 0.0, 1.0, settings.reverbMix);
    if (params.has("loop"))
        settings.loopCount = clampInt(params.get("loop"), 1, 100, settings.loopCount);

    return settings;
}

/**
 * Compares two settings objects to determine if any configuration parameters differ.
 *
 * @param {object} a - First settings snapshot.
 * @param {object} b - Second settings snapshot.
 * @returns {boolean} True if any setting has changed, false otherwise.
 */
export function hasPresetChanges(a, b) {
    if (!a || !b) return true;

    const eps = 1e-9;

    const notesA = Array.isArray(a.baseNotes) ? a.baseNotes.join(" ") : "";
    const notesB = Array.isArray(b.baseNotes) ? b.baseNotes.join(" ") : "";
    if (notesA !== notesB) return true;

    if (a.direction !== b.direction) return true;
    if (a.interval !== b.interval) return true;
    if (a.synthType !== b.synthType) return true;
    if (a.waveform !== b.waveform) return true;
    if (a.scaleRoot !== b.scaleRoot) return true;
    if (a.scaleType !== b.scaleType) return true;
    if (a.scaleQuantize !== b.scaleQuantize) return true;
    if (Math.abs((a.bpm ?? 0) - (b.bpm ?? 0)) > eps) return true;
    if (Math.abs((a.swing ?? 0) - (b.swing ?? 0)) > eps) return true;
    if (Math.abs((a.postGain ?? 0) - (b.postGain ?? 0)) > eps) return true;
    if (Math.abs((a.harmonicity ?? 0) - (b.harmonicity ?? 0)) > eps) return true;
    if (Math.abs((a.modulationIndex ?? 0) - (b.modulationIndex ?? 0)) > eps) return true;
    if (Math.abs((a.dutyCycle ?? 0) - (b.dutyCycle ?? 0)) > eps) return true;
    if (Math.abs((a.gateRatio ?? 0) - (b.gateRatio ?? 0)) > eps) return true;
    if (a.octaveShift !== b.octaveShift) return true;
    if (a.octaveRange !== b.octaveRange) return true;
    if (Math.abs((a.envAttack ?? 0) - (b.envAttack ?? 0)) > eps) return true;
    if (Math.abs((a.envDecay ?? 0) - (b.envDecay ?? 0)) > eps) return true;
    if (Math.abs((a.envSustain ?? 0) - (b.envSustain ?? 0)) > eps) return true;
    if (Math.abs((a.envRelease ?? 0) - (b.envRelease ?? 0)) > eps) return true;
    if (Math.abs((a.filterCutoff ?? 0) - (b.filterCutoff ?? 0)) > eps) return true;
    if (Math.abs((a.filterResonance ?? 0) - (b.filterResonance ?? 0)) > eps) return true;
    if (Math.abs((a.driveMix ?? 0) - (b.driveMix ?? 0)) > eps) return true;
    if (Math.abs((a.chorusMix ?? 0) - (b.chorusMix ?? 0)) > eps) return true;
    if (Math.abs((a.autoPanMix ?? 0) - (b.autoPanMix ?? 0)) > eps) return true;
    if (Math.abs((a.delayMix ?? 0) - (b.delayMix ?? 0)) > eps) return true;
    if (Math.abs((a.reverbMix ?? 0) - (b.reverbMix ?? 0)) > eps) return true;
    if (a.loopCount !== b.loopCount) return true;

    return false;
}

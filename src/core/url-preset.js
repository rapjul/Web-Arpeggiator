/**
 * Pure domain module for serializing and deserializing preset settings to/from URL search parameters.
 *
 * Implements strict boundary validation, parameter clamping, and change-detection logic
 * completely independent of the browser DOM or window objects.
 *
 * @module url-preset
 */

import {
    normalizeOfflineExportMode,
    normalizeOfflineExportTailMode,
    normalizeOfflineExportTailSeconds,
} from "./export-duration.js";
import { normalizeNotesSequence } from "./pattern-core.js";
import { MAX_RANDOM_SEED } from "./random-seed.js";
import {
    ALLOWED_DIRECTIONS,
    ALLOWED_INTERVALS,
    ALLOWED_ROOTS,
    ALLOWED_SCALES,
    ALLOWED_SYNTHS,
    ALLOWED_WAVEFORMS,
    SETTINGS_BOUNDS,
} from "./settings-contract.js";

/**
 * Recognized query parameter keys mapped to preset settings.
 * @type {ReadonlySet<string>}
 */
export const PRESET_URL_KEYS = Object.freeze(
    new Set([
        "bpm",
        "swing",
        "seed",
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
        "export",
        "tail-mode",
        "tail",
    ]),
);

/**
 * Allowed pattern direction slugs.
 * @type {ReadonlyArray<string>}
 */
export {
    ALLOWED_DIRECTIONS,
    ALLOWED_INTERVALS,
    ALLOWED_ROOTS,
    ALLOWED_SCALES,
    ALLOWED_SYNTHS,
    ALLOWED_WAVEFORMS,
};

/**
 * Allowed note intervals.
 * @type {ReadonlyArray<string>}
 */

/**
 * Regular expression to validate space-separated note sequences with optional octaves and case-insensitivity (e.g. "C4 E4 G4", "c e g", "C#4 Eb5").
 * @type {RegExp}
 */
export const NOTES_REGEX = /^[A-Ga-g][b#]?[0-9]?(\s+[A-Ga-g][b#]?[0-9]?)*$/;

/**
 * Parses and clamps an integer value between minimum and maximum bounds, returning null if invalid.
 *
 * @param {string|null|undefined} val - Raw string value to parse.
 * @param {number} min - Inclusive minimum value.
 * @param {number} max - Inclusive maximum value.
 * @returns {number|null} The clamped integer, or null if parsing fails.
 */
export function tryClampInt(val, min, max) {
    if (val === null || val === undefined) return null;
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed)) return null;
    return Math.min(Math.max(parsed, min), max);
}

/**
 * Parses and clamps a floating-point value between minimum and maximum bounds, returning null if invalid.
 *
 * @param {string|null|undefined} val - Raw string value to parse.
 * @param {number} min - Inclusive minimum value.
 * @param {number} max - Inclusive maximum value.
 * @returns {number|null} The clamped float, or null if parsing fails.
 */
export function tryClampFloat(val, min, max) {
    if (val === null || val === undefined) return null;
    const parsed = parseFloat(val);
    if (Number.isNaN(parsed)) return null;
    return Math.min(Math.max(parsed, min), max);
}

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
    const parsed = tryClampInt(val, min, max);
    return parsed !== null ? parsed : fallback;
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
    const parsed = tryClampFloat(val, min, max);
    return parsed !== null ? parsed : fallback;
}

/**
 * @typedef {Object} PresetSettings
 * @property {readonly string[]} [baseNotes] - Active base notes array.
 * @property {readonly string[]} [notes] - Expanded octave notes array.
 * @property {number} [bpm] - Beats per minute.
 * @property {number} [swing] - Swing feel ratio.
 * @property {number} [randomSeed] - Reproducible stochastic pattern seed.
 * @property {number} [postGain] - Master output gain in dB.
 * @property {string} [direction] - Pattern direction slug.
 * @property {string} [interval] - Note subdivision interval.
 * @property {boolean} [scaleQuantize] - Whether scale quantization is active.
 * @property {string} [scaleRoot] - Musical root note for quantization.
 * @property {string} [scaleType] - Musical scale mode for quantization.
 * @property {string} [synthType] - Selected synthesizer engine.
 * @property {string} [waveform] - Selected oscillator waveform.
 * @property {number} [harmonicity] - FM/AM harmonicity ratio.
 * @property {number} [modulationIndex] - FM modulation index.
 * @property {number} [dutyCycle] - Pulse/square wave duty cycle.
 * @property {number} [gateRatio] - Note gate length ratio.
 * @property {number} [octaveShift] - Octave transposition shift.
 * @property {number} [octaveRange] - Number of octaves spanned.
 * @property {number} [envAttack] - Envelope attack time in seconds.
 * @property {number} [envDecay] - Envelope decay time in seconds.
 * @property {number} [envSustain] - Envelope sustain level (0-1).
 * @property {number} [envRelease] - Envelope release time in seconds.
 * @property {number} [filterCutoff] - Filter cutoff frequency in Hz.
 * @property {number} [filterResonance] - Filter resonance (Q factor).
 * @property {number} [driveMix] - Distortion drive wet mix.
 * @property {number} [chorusMix] - Chorus effect wet mix.
 * @property {number} [autoPanMix] - Auto-pan effect wet mix.
 * @property {number} [delayMix] - Delay effect wet mix.
 * @property {number} [reverbMix] - Reverb effect wet mix.
 * @property {number} [loopCount] - Number of loops for export.
 * @property {"seamless"|"tail"} [offlineExportMode] - Offline audio export mode.
 * @property {"auto"|"custom"} [offlineExportTailMode] - Effects-tail strategy.
 * @property {number} [offlineExportTailSeconds] - Appended effects tail duration.
 * @property {number} [monoCutoff] - MonoSynth filter cutoff.
 * @property {number} [monoOctaves] - MonoSynth filter octave span.
 * @property {number} [monoQ] - MonoSynth filter resonance.
 * @property {number} [duoHarm] - DuoSynth harmonicity.
 * @property {number} [duoVibrato] - DuoSynth vibrato amount.
 * @property {number} [pluckDampening] - PluckSynth string dampening frequency.
 * @property {number} [pluckResonance] - PluckSynth resonance.
 * @property {number} [pluckNoise] - PluckSynth noise floor level.
 * @property {number} [membranePitchDecay] - MembraneSynth pitch decay.
 * @property {number} [membraneOctaves] - MembraneSynth pitch octaves.
 */

/**
 * Serializes a full settings snapshot into URL search parameters.
 *
 * @param {PresetSettings & Record<string, unknown>} settings - Application settings object.
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
    if (settings.randomSeed !== undefined) params.set("seed", String(settings.randomSeed));
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
    if (settings.offlineExportMode !== undefined) {
        params.set("export", normalizeOfflineExportMode(settings.offlineExportMode));
    }
    if (settings.offlineExportTailMode !== undefined) {
        params.set(
            "tail-mode",
            normalizeOfflineExportTailMode(settings.offlineExportTailMode, "custom"),
        );
    }
    if (settings.offlineExportTailSeconds !== undefined) {
        params.set(
            "tail",
            normalizeOfflineExportTailSeconds(settings.offlineExportTailSeconds).toFixed(1),
        );
    }

    return params;
}

/**
 * Checks whether the provided URL search parameters or query string contain any valid recognized preset parameters.
 *
 * @param {URLSearchParams|string|null|undefined} searchParams - URL search parameters instance or query string.
 * @returns {boolean} True if at least one recognized preset parameter contains a valid value, false otherwise.
 */
export function hasPresetUrlParams(searchParams) {
    if (!searchParams) return false;
    try {
        const params =
            typeof searchParams === "string" ? new URLSearchParams(searchParams) : searchParams;
        if (!params) return false;
        return parsePresetFromUrlParams(params, /** @type {any} */ ({})) !== null;
    } catch {
        return false;
    }
}

/**
 * Applies validated musical notes from query parameters to the settings.
 *
 * @param {URLSearchParams} params - Search parameters.
 * @param {PresetSettings & Record<string, unknown>} settings - Target settings.
 * @returns {number} The count of valid applied parameters.
 */
function applyNotesUrlParam(params, settings) {
    if (!params.has("notes")) return 0;
    const rawNotes = params.get("notes")?.trim() || "";
    if (NOTES_REGEX.test(rawNotes)) {
        const normalized = normalizeNotesSequence(rawNotes);
        if (normalized.length > 0) {
            settings.baseNotes = normalized;
            return 1;
        }
    }
    return 0;
}

/**
 * Applies discrete string and boolean query parameters to the settings.
 *
 * @param {URLSearchParams} params - Search parameters.
 * @param {PresetSettings & Record<string, unknown>} settings - Target settings.
 * @returns {number} The count of valid applied parameters.
 */
function applyDiscreteUrlParams(params, settings) {
    let appliedCount = 0;
    if (params.has("dir")) {
        const dir = params.get("dir");
        if (dir && ALLOWED_DIRECTIONS.includes(dir)) {
            settings.direction = dir;
            appliedCount++;
        }
    }
    if (params.has("int")) {
        const interval = params.get("int");
        if (interval && ALLOWED_INTERVALS.includes(interval)) {
            settings.interval = interval;
            appliedCount++;
        }
    }
    if (params.has("quant")) {
        const quant = params.get("quant");
        if (quant === "true" || quant === "false") {
            settings.scaleQuantize = quant === "true";
            appliedCount++;
        }
    }
    if (params.has("root")) {
        const root = params.get("root");
        if (root && ALLOWED_ROOTS.includes(root)) {
            settings.scaleRoot = root;
            appliedCount++;
        }
    }
    if (params.has("scale")) {
        const scale = params.get("scale");
        if (scale && ALLOWED_SCALES.includes(scale)) {
            settings.scaleType = scale;
            appliedCount++;
        }
    }
    if (params.has("synth")) {
        const synth = params.get("synth");
        if (synth && ALLOWED_SYNTHS.includes(synth)) {
            settings.synthType = synth;
            appliedCount++;
        }
    }
    if (params.has("wave")) {
        const wave = params.get("wave");
        if (wave && ALLOWED_WAVEFORMS.includes(wave)) {
            settings.waveform = wave;
            appliedCount++;
        }
    }
    return appliedCount;
}

/**
 * Applies bounded integer and floating point query parameters to the settings.
 *
 * @param {URLSearchParams} params - Search parameters.
 * @param {PresetSettings & Record<string, unknown>} settings - Target settings.
 * @returns {number} The count of valid applied parameters.
 */
function applyNumericUrlParams(params, settings) {
    let appliedCount = 0;
    if (params.has("bpm")) {
        const val = tryClampInt(params.get("bpm"), ...SETTINGS_BOUNDS.bpm);
        if (val !== null) {
            settings.bpm = val;
            appliedCount++;
        }
    }
    if (params.has("swing")) {
        const val = tryClampFloat(params.get("swing"), ...SETTINGS_BOUNDS.swing);
        if (val !== null) {
            settings.swing = val;
            appliedCount++;
        }
    }
    if (params.has("seed")) {
        const val = tryClampInt(params.get("seed"), 0, MAX_RANDOM_SEED);
        if (val !== null) {
            settings.randomSeed = val;
            appliedCount++;
        }
    }
    if (params.has("gain")) {
        const val = tryClampFloat(params.get("gain"), ...SETTINGS_BOUNDS.postGain);
        if (val !== null) {
            settings.postGain = val;
            appliedCount++;
        }
    }
    if (params.has("harm")) {
        const val = tryClampFloat(params.get("harm"), 0.5, 10.0);
        if (val !== null) {
            settings.harmonicity = val;
            appliedCount++;
        }
    }
    if (params.has("mod")) {
        const val = tryClampFloat(params.get("mod"), 1.0, 50.0);
        if (val !== null) {
            settings.modulationIndex = val;
            appliedCount++;
        }
    }
    if (params.has("duty")) {
        const val = tryClampFloat(params.get("duty"), 0.01, 0.99);
        if (val !== null) {
            settings.dutyCycle = val;
            appliedCount++;
        }
    }
    if (params.has("gate")) {
        const val = tryClampFloat(params.get("gate"), 0.05, 1.0);
        if (val !== null) {
            settings.gateRatio = val;
            appliedCount++;
        }
    }
    if (params.has("shift")) {
        const val = tryClampInt(params.get("shift"), -3, 3);
        if (val !== null) {
            settings.octaveShift = val;
            appliedCount++;
        }
    }
    if (params.has("range")) {
        const val = tryClampInt(params.get("range"), 1, 5);
        if (val !== null) {
            settings.octaveRange = val;
            appliedCount++;
        }
    }
    if (params.has("attack")) {
        const val = tryClampFloat(params.get("attack"), 0.0, 2.0);
        if (val !== null) {
            settings.envAttack = val;
            appliedCount++;
        }
    }
    if (params.has("decay")) {
        const val = tryClampFloat(params.get("decay"), 0.0, 2.0);
        if (val !== null) {
            settings.envDecay = val;
            appliedCount++;
        }
    }
    if (params.has("sustain")) {
        const val = tryClampFloat(params.get("sustain"), 0.0, 1.0);
        if (val !== null) {
            settings.envSustain = val;
            appliedCount++;
        }
    }
    if (params.has("release")) {
        const val = tryClampFloat(params.get("release"), 0.0, 5.0);
        if (val !== null) {
            settings.envRelease = val;
            appliedCount++;
        }
    }
    if (params.has("cutoff")) {
        const val = tryClampFloat(params.get("cutoff"), 100.0, 10000.0);
        if (val !== null) {
            settings.filterCutoff = val;
            appliedCount++;
        }
    }
    if (params.has("res")) {
        const val = tryClampFloat(params.get("res"), 0.0, 20.0);
        if (val !== null) {
            settings.filterResonance = val;
            appliedCount++;
        }
    }
    if (params.has("drive")) {
        const val = tryClampFloat(params.get("drive"), 0.0, 1.0);
        if (val !== null) {
            settings.driveMix = val;
            appliedCount++;
        }
    }
    if (params.has("chorus")) {
        const val = tryClampFloat(params.get("chorus"), 0.0, 1.0);
        if (val !== null) {
            settings.chorusMix = val;
            appliedCount++;
        }
    }
    if (params.has("pan")) {
        const val = tryClampFloat(params.get("pan"), 0.0, 1.0);
        if (val !== null) {
            settings.autoPanMix = val;
            appliedCount++;
        }
    }
    if (params.has("delay")) {
        const val = tryClampFloat(params.get("delay"), 0.0, 1.0);
        if (val !== null) {
            settings.delayMix = val;
            appliedCount++;
        }
    }
    if (params.has("reverb")) {
        const val = tryClampFloat(params.get("reverb"), 0.0, 1.0);
        if (val !== null) {
            settings.reverbMix = val;
            appliedCount++;
        }
    }
    if (params.has("loop")) {
        const val = tryClampInt(params.get("loop"), 1, 100);
        if (val !== null) {
            settings.loopCount = val;
            appliedCount++;
        }
    }
    return appliedCount;
}

/**
 * Applies offline audio export query parameters to the settings.
 *
 * @param {URLSearchParams} params - Search parameters.
 * @param {PresetSettings & Record<string, unknown>} settings - Target settings.
 * @returns {number} The count of valid applied parameters.
 */
function applyExportUrlParams(params, settings) {
    let appliedCount = 0;
    if (params.has("export")) {
        const mode = params.get("export");
        if (mode === "seamless" || mode === "tail") {
            settings.offlineExportMode = normalizeOfflineExportMode(mode);
            appliedCount++;
        }
    }
    if (params.has("tail-mode")) {
        const tailMode = params.get("tail-mode");
        if (tailMode === "auto" || tailMode === "custom") {
            settings.offlineExportTailMode = normalizeOfflineExportTailMode(
                tailMode,
                settings.offlineExportTailMode === "custom" ? "custom" : "auto",
            );
            appliedCount++;
        }
    }
    if (params.has("tail")) {
        const val = tryClampFloat(params.get("tail"), 0.0, 10.0);
        if (val !== null) {
            settings.offlineExportTailSeconds = normalizeOfflineExportTailSeconds(val);
            appliedCount++;
        }
    }
    return appliedCount;
}

/**
 * Parses and strictly validates preset search parameters against default or current settings.
 *
 * @template {PresetSettings & Record<string, unknown>} T
 * @param {URLSearchParams|string} searchParams - URL search parameters instance or query string.
 * @param {T} currentSettings - Current baseline application settings.
 * @returns {T|null} Updated settings object if any valid preset parameters were recognized, or null otherwise.
 */
export function parsePresetFromUrlParams(searchParams, currentSettings) {
    const params =
        typeof searchParams === "string" ? new URLSearchParams(searchParams) : searchParams;

    if (!params) return null;

    /** @type {T & PresetSettings} */
    const settings = { ...currentSettings };

    let totalApplied = 0;
    totalApplied += applyNotesUrlParam(params, settings);
    totalApplied += applyNumericUrlParams(params, settings);
    totalApplied += applyDiscreteUrlParams(params, settings);
    totalApplied += applyExportUrlParams(params, settings);

    if (totalApplied === 0) return null;

    return settings;
}

const PRESET_IDENTITY_FIELDS = [
    "direction",
    "interval",
    "synthType",
    "waveform",
    "scaleRoot",
    "scaleType",
    "scaleQuantize",
    "randomSeed",
    "octaveShift",
    "octaveRange",
    "loopCount",
];

const PRESET_NUMERIC_TOLERANCE_FIELDS = [
    "bpm",
    "swing",
    "postGain",
    "harmonicity",
    "modulationIndex",
    "dutyCycle",
    "gateRatio",
    "envAttack",
    "envDecay",
    "envSustain",
    "envRelease",
    "filterCutoff",
    "filterResonance",
    "driveMix",
    "chorusMix",
    "autoPanMix",
    "delayMix",
    "reverbMix",
];

/**
 * Checks whether offline export settings differ between two snapshots.
 *
 * @param {PresetSettings & Record<string, unknown>} a - First settings snapshot.
 * @param {PresetSettings & Record<string, unknown>} b - Second settings snapshot.
 * @param {number} eps - Numeric tolerance epsilon.
 * @returns {boolean} True if export settings differ.
 */
function hasExportSettingChanges(a, b, eps) {
    if (
        normalizeOfflineExportMode(a.offlineExportMode) !==
        normalizeOfflineExportMode(b.offlineExportMode)
    ) {
        return true;
    }
    if (
        normalizeOfflineExportTailMode(a.offlineExportTailMode, "custom") !==
        normalizeOfflineExportTailMode(b.offlineExportTailMode, "custom")
    ) {
        return true;
    }
    return (
        Math.abs(
            normalizeOfflineExportTailSeconds(a.offlineExportTailSeconds) -
                normalizeOfflineExportTailSeconds(b.offlineExportTailSeconds),
        ) > eps
    );
}

/**
 * Compares two settings objects to determine if any configuration parameters differ.
 *
 * @param {PresetSettings & Record<string, unknown>} a - First settings snapshot.
 * @param {PresetSettings & Record<string, unknown>} b - Second settings snapshot.
 * @returns {boolean} True if any setting has changed, false otherwise.
 */
export function hasPresetChanges(a, b) {
    if (!a || !b) return true;

    const notesA = Array.isArray(a.baseNotes) ? a.baseNotes.join(" ") : "";
    const notesB = Array.isArray(b.baseNotes) ? b.baseNotes.join(" ") : "";
    if (notesA !== notesB) return true;

    /** @type {Record<string, unknown>} */
    const recordA = a;
    /** @type {Record<string, unknown>} */
    const recordB = b;

    for (const key of PRESET_IDENTITY_FIELDS) {
        if (recordA[key] !== recordB[key]) return true;
    }

    const eps = 1e-9;
    for (const key of PRESET_NUMERIC_TOLERANCE_FIELDS) {
        const valA = Number(recordA[key] ?? 0);
        const valB = Number(recordB[key] ?? 0);
        if (Math.abs(valA - valB) > eps) return true;
    }

    return hasExportSettingChanges(a, b, eps);
}

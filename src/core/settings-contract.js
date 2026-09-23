/**
 * Versioned, serializable settings contract shared by application defaults,
 * presets, persistence, and controller boundaries.
 *
 * @module settings-contract
 */

import {
    normalizeLoopCount,
    normalizeOfflineExportMode,
    normalizeOfflineExportTailSeconds,
} from "./export-duration.js";
import { CHROMATIC_PITCHES, getArpeggioNotes, normalizeNotesSequence } from "./pattern-core.js";
import { DEFAULT_RANDOM_SEED, normalizeRandomSeed } from "./random-seed.js";
import { DEFAULT_BPM, MAX_BPM, MIN_BPM } from "./timing-constants.js";

/** Canonical select-control values shared by settings and URL persistence. */
export const ALLOWED_DIRECTIONS = Object.freeze([
    "up",
    "down",
    "upDown",
    "downUp",
    "upDownRepeat",
    "downUpRepeat",
    "random",
    "randomCycle",
    "octaveCycle",
    "octaveCycleReverse",
    "octaveCyclePingPong",
    "randomWalk",
    "randomWalkDrunk",
]);
export const ALLOWED_INTERVALS = Object.freeze(["64n", "32n", "16n", "8n", "4n", "2n"]);
export const ALLOWED_ROOTS = CHROMATIC_PITCHES;
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
    "majorPentatonic",
    "chromatic",
]);
export const ALLOWED_SYNTHS = Object.freeze([
    "synth",
    "fmSynth",
    "amSynth",
    "monoSynth",
    "duoSynth",
    "pluckSynth",
    "membraneSynth",
]);
export const ALLOWED_WAVEFORMS = Object.freeze(["sine", "square", "sawtooth", "triangle", "pulse"]);

/** @type {Readonly<Record<string, readonly [number, number]>>} Numeric control bounds shared by every persistence boundary. */
export const SETTINGS_BOUNDS = Object.freeze({
    bpm: [MIN_BPM, MAX_BPM],
    swing: [0, 1],
    postGain: [-40, 0],
    octaveShift: [-3, 3],
    octaveRange: [1, 5],
    harmonicity: [0.5, 10],
    modulationIndex: [1, 50],
    dutyCycle: [0.01, 0.99],
    gateRatio: [0.05, 1],
    monoCutoff: [20, 10000],
    monoOctaves: [0, 8],
    monoQ: [0, 20],
    duoHarm: [0.5, 10],
    duoVibrato: [0, 1],
    pluckDampening: [0, 10000],
    pluckResonance: [0, 1],
    pluckNoise: [0, 10],
    membranePitchDecay: [0, 1],
    membraneOctaves: [0, 16],
    envAttack: [0, 2],
    envDecay: [0, 2],
    envSustain: [0, 1],
    envRelease: [0, 5],
    filterCutoff: [100, 10000],
    filterResonance: [0, 20],
    driveMix: [0, 1],
    chorusMix: [0, 1],
    autoPanMix: [0, 1],
    delayMix: [0, 1],
    reverbMix: [0, 1],
});

/** @typedef {Record<string, unknown> & {
 *   bpm: number,
 *   settingsVersion: number,
 *   swing: number,
 *   randomSeed: number,
 *   postGain: number,
 *   baseNotes: readonly string[],
 *   direction: string,
 *   interval: string,
 *   octaveShift: number,
 *   octaveRange: number,
 *   scaleQuantize: boolean,
 *   scaleRoot: string,
 *   scaleType: string,
 *   synthType: string,
 *   waveform: string,
 *   harmonicity: number,
 *   modulationIndex: number,
 *   dutyCycle: number,
 *   gateRatio: number,
 *   monoCutoff: number,
 *   monoOctaves: number,
 *   monoQ: number,
 *   duoHarm: number,
 *   duoVibrato: number,
 *   pluckDampening: number,
 *   pluckResonance: number,
 *   pluckNoise: number,
 *   membranePitchDecay: number,
 *   membraneOctaves: number,
 *   envAttack: number,
 *   envDecay: number,
 *   envSustain: number,
 *   envRelease: number,
 *   filterCutoff: number,
 *   filterResonance: number,
 *   driveMix: number,
 *   chorusMix: number,
 *   autoPanMix: number,
 *   delayMix: number,
 *   reverbMix: number,
 *   loopCount: number,
 *   offlineExportMode: "seamless"|"tail",
 *   offlineExportTailSeconds: number,
 *   notes: readonly string[]
 * }} ArpeggiatorSettings
 */

/** Increment when a persisted settings migration is required. */
export const SETTINGS_SCHEMA_VERSION = 1;
export { DEFAULT_RANDOM_SEED, MAX_RANDOM_SEED } from "./random-seed.js";

export class UnsupportedSettingsVersionError extends Error {
    /** @param {unknown} settingsVersion */
    constructor(settingsVersion) {
        super(
            `Settings version ${settingsVersion} is newer than supported version ${SETTINGS_SCHEMA_VERSION}.`,
        );
        this.name = "UnsupportedSettingsVersionError";
        this.settingsVersion = settingsVersion;
        this.isFutureVersion =
            typeof settingsVersion === "number" &&
            Number.isInteger(settingsVersion) &&
            settingsVersion > SETTINGS_SCHEMA_VERSION;
    }
}

/**
 * Canonical values used when a session begins, settings are reset, or a
 * partial factory preset is selected. Keep this synchronized with the
 * documented defaults.
 *
 * @type {Readonly<ArpeggiatorSettings>}
 */
export const DEFAULT_SETTINGS = Object.freeze({
    settingsVersion: SETTINGS_SCHEMA_VERSION,
    bpm: DEFAULT_BPM,
    swing: 0,
    randomSeed: DEFAULT_RANDOM_SEED,
    postGain: -6,
    baseNotes: Object.freeze(["C4", "E4", "G4"]),
    direction: "up",
    interval: "16n",
    octaveShift: 0,
    octaveRange: 2,
    scaleQuantize: true,
    scaleRoot: "C",
    scaleType: "major",
    synthType: "synth",
    waveform: "sine",
    harmonicity: 3,
    modulationIndex: 10,
    dutyCycle: 0.5,
    gateRatio: 0.8,
    monoCutoff: 300,
    monoOctaves: 4,
    monoQ: 2,
    duoHarm: 1.5,
    duoVibrato: 0.2,
    pluckDampening: 4000,
    pluckResonance: 0.9,
    pluckNoise: 1,
    membranePitchDecay: 0.05,
    membraneOctaves: 8,
    envAttack: 0.01,
    envDecay: 0.1,
    envSustain: 0.3,
    envRelease: 0.5,
    filterCutoff: 4000,
    filterResonance: 1,
    driveMix: 0,
    chorusMix: 0,
    autoPanMix: 0,
    delayMix: 0.2,
    reverbMix: 0.3,
    loopCount: 4,
    offlineExportMode: "tail",
    offlineExportTailSeconds: 2,
    notes: Object.freeze(["C4", "C5", "E4", "E5", "G4", "G5"]),
});

/**
 * Materializes a complete settings snapshot without sharing the notes array
 * with either input. This lets partial presets always restore deterministically.
 *
 * @param {ArpeggiatorSettings} defaults - Complete baseline settings.
 * @param {Partial<ArpeggiatorSettings>} overrides - Values supplied by a preset or migration.
 * @returns {ArpeggiatorSettings} A new complete settings snapshot.
 */
export function mergeSettings(defaults, overrides) {
    const baseNotes = overrides.baseNotes ?? defaults.baseNotes;

    const merged = {
        ...defaults,
        ...overrides,
        settingsVersion: SETTINGS_SCHEMA_VERSION,
        baseNotes: [...baseNotes],
    };
    return {
        ...merged,
        notes: getArpeggioNotes(merged.baseNotes, {
            octaveRange: merged.octaveRange,
            octaveShift: merged.octaveShift,
        }),
    };
}

/**
 * Checks whether a value is a non-array object that can safely be read as a
 * serialized settings snapshot.
 *
 * @param {unknown} value - Candidate imported or persisted value.
 * @returns {value is Record<string, unknown>} Whether the value is a record.
 */
function isSettingsRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Preserves a finite numeric setting inside its supported UI range.
 *
 * @param {unknown} value - Candidate numeric value.
 * @param {number} fallback - Safe value to retain when the candidate is invalid.
 * @param {number} minimum - Inclusive lower limit.
 * @param {number} maximum - Inclusive upper limit.
 * @returns {number} A finite, bounded number.
 */
function normalizeNumber(value, fallback, minimum, maximum) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Retains a value only when it is a supported select-control option.
 *
 * @param {unknown} value - Candidate select value.
 * @param {ReadonlyArray<string>} allowed - Supported control values.
 * @param {string} fallback - Safe value to retain when the candidate is invalid.
 * @returns {string} A supported select value.
 */
function normalizeAllowedValue(value, allowed, fallback) {
    return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

/**
 * Normalizes external settings before they reach DOM, audio, or persistence
 * boundaries. Import files and IndexedDB records are untrusted even when their
 * shape resembles a previous application snapshot.
 *
 * @param {unknown} candidate - Imported, restored, or otherwise external settings.
 * @param {ArpeggiatorSettings} [fallback=DEFAULT_SETTINGS] - Complete settings used for invalid fields.
 * @returns {ArpeggiatorSettings} A complete, bounded settings snapshot.
 */
export function normalizeSettings(candidate, fallback = DEFAULT_SETTINGS, options = {}) {
    const source = isSettingsRecord(candidate) ? candidate : {};
    const sourceVersion = source.settingsVersion;
    const hasExplicitVersion = Object.hasOwn(source, "settingsVersion");
    if (
        hasExplicitVersion &&
        (typeof sourceVersion !== "number" ||
            !Number.isInteger(sourceVersion) ||
            sourceVersion < SETTINGS_SCHEMA_VERSION)
    ) {
        throw new UnsupportedSettingsVersionError(sourceVersion);
    }
    if (
        !options.allowFutureVersion &&
        hasExplicitVersion &&
        typeof sourceVersion === "number" &&
        sourceVersion > SETTINGS_SCHEMA_VERSION
    ) {
        throw new UnsupportedSettingsVersionError(sourceVersion);
    }
    const sourceNotes = source.baseNotes ?? source.notes;
    const notesInput =
        typeof sourceNotes === "string" ||
        (Array.isArray(sourceNotes) && sourceNotes.every((note) => typeof note === "string"))
            ? sourceNotes
            : fallback.baseNotes;
    const normalizedNotes = normalizeNotesSequence(
        typeof notesInput === "string" ? notesInput : [...notesInput],
    );

    const settings = {
        settingsVersion: SETTINGS_SCHEMA_VERSION,
        bpm: normalizeNumber(source.bpm, fallback.bpm, ...SETTINGS_BOUNDS.bpm),
        swing: normalizeNumber(source.swing, fallback.swing, ...SETTINGS_BOUNDS.swing),
        randomSeed: normalizeRandomSeed(source.randomSeed, fallback.randomSeed),
        postGain: normalizeNumber(source.postGain, fallback.postGain, ...SETTINGS_BOUNDS.postGain),
        baseNotes: normalizedNotes.length > 0 ? normalizedNotes : [...fallback.baseNotes],
        direction: normalizeAllowedValue(source.direction, ALLOWED_DIRECTIONS, fallback.direction),
        interval: normalizeAllowedValue(source.interval, ALLOWED_INTERVALS, fallback.interval),
        octaveShift: Math.trunc(
            normalizeNumber(
                source.octaveShift,
                fallback.octaveShift,
                ...SETTINGS_BOUNDS.octaveShift,
            ),
        ),
        octaveRange: Math.trunc(
            normalizeNumber(
                source.octaveRange,
                fallback.octaveRange,
                ...SETTINGS_BOUNDS.octaveRange,
            ),
        ),
        scaleQuantize:
            typeof source.scaleQuantize === "boolean"
                ? source.scaleQuantize
                : fallback.scaleQuantize,
        scaleRoot: normalizeAllowedValue(source.scaleRoot, ALLOWED_ROOTS, fallback.scaleRoot),
        scaleType: normalizeAllowedValue(source.scaleType, ALLOWED_SCALES, fallback.scaleType),
        synthType: normalizeAllowedValue(source.synthType, ALLOWED_SYNTHS, fallback.synthType),
        waveform: normalizeAllowedValue(source.waveform, ALLOWED_WAVEFORMS, fallback.waveform),
        harmonicity: normalizeNumber(
            source.harmonicity,
            fallback.harmonicity,
            ...SETTINGS_BOUNDS.harmonicity,
        ),
        modulationIndex: normalizeNumber(
            source.modulationIndex,
            fallback.modulationIndex,
            ...SETTINGS_BOUNDS.modulationIndex,
        ),
        dutyCycle: normalizeNumber(
            source.dutyCycle,
            fallback.dutyCycle,
            ...SETTINGS_BOUNDS.dutyCycle,
        ),
        gateRatio: normalizeNumber(
            source.gateRatio,
            fallback.gateRatio,
            ...SETTINGS_BOUNDS.gateRatio,
        ),
        monoCutoff: normalizeNumber(
            source.monoCutoff,
            fallback.monoCutoff,
            ...SETTINGS_BOUNDS.monoCutoff,
        ),
        monoOctaves: normalizeNumber(
            source.monoOctaves,
            fallback.monoOctaves,
            ...SETTINGS_BOUNDS.monoOctaves,
        ),
        monoQ: normalizeNumber(source.monoQ, fallback.monoQ, ...SETTINGS_BOUNDS.monoQ),
        duoHarm: normalizeNumber(source.duoHarm, fallback.duoHarm, ...SETTINGS_BOUNDS.duoHarm),
        duoVibrato: normalizeNumber(
            source.duoVibrato,
            fallback.duoVibrato,
            ...SETTINGS_BOUNDS.duoVibrato,
        ),
        pluckDampening: normalizeNumber(
            source.pluckDampening,
            fallback.pluckDampening,
            ...SETTINGS_BOUNDS.pluckDampening,
        ),
        pluckResonance: normalizeNumber(
            source.pluckResonance,
            fallback.pluckResonance,
            ...SETTINGS_BOUNDS.pluckResonance,
        ),
        pluckNoise: normalizeNumber(
            source.pluckNoise,
            fallback.pluckNoise,
            ...SETTINGS_BOUNDS.pluckNoise,
        ),
        membranePitchDecay: normalizeNumber(
            source.membranePitchDecay,
            fallback.membranePitchDecay,
            ...SETTINGS_BOUNDS.membranePitchDecay,
        ),
        membraneOctaves: normalizeNumber(
            source.membraneOctaves,
            fallback.membraneOctaves,
            ...SETTINGS_BOUNDS.membraneOctaves,
        ),
        envAttack: normalizeNumber(
            source.envAttack,
            fallback.envAttack,
            ...SETTINGS_BOUNDS.envAttack,
        ),
        envDecay: normalizeNumber(source.envDecay, fallback.envDecay, ...SETTINGS_BOUNDS.envDecay),
        envSustain: normalizeNumber(
            source.envSustain,
            fallback.envSustain,
            ...SETTINGS_BOUNDS.envSustain,
        ),
        envRelease: normalizeNumber(
            source.envRelease,
            fallback.envRelease,
            ...SETTINGS_BOUNDS.envRelease,
        ),
        filterCutoff: normalizeNumber(
            source.filterCutoff,
            fallback.filterCutoff,
            ...SETTINGS_BOUNDS.filterCutoff,
        ),
        filterResonance: normalizeNumber(
            source.filterResonance,
            fallback.filterResonance,
            ...SETTINGS_BOUNDS.filterResonance,
        ),
        driveMix: normalizeNumber(source.driveMix, fallback.driveMix, ...SETTINGS_BOUNDS.driveMix),
        chorusMix: normalizeNumber(
            source.chorusMix,
            fallback.chorusMix,
            ...SETTINGS_BOUNDS.chorusMix,
        ),
        autoPanMix: normalizeNumber(
            source.autoPanMix,
            fallback.autoPanMix,
            ...SETTINGS_BOUNDS.autoPanMix,
        ),
        delayMix: normalizeNumber(source.delayMix, fallback.delayMix, ...SETTINGS_BOUNDS.delayMix),
        reverbMix: normalizeNumber(
            source.reverbMix,
            fallback.reverbMix,
            ...SETTINGS_BOUNDS.reverbMix,
        ),
        loopCount: normalizeLoopCount(source.loopCount ?? fallback.loopCount),
        offlineExportMode: normalizeOfflineExportMode(
            source.offlineExportMode ?? fallback.offlineExportMode,
        ),
        offlineExportTailSeconds: normalizeOfflineExportTailSeconds(
            source.offlineExportTailSeconds ?? fallback.offlineExportTailSeconds,
        ),
    };
    return {
        ...settings,
        notes: getArpeggioNotes(settings.baseNotes, {
            octaveRange: settings.octaveRange,
            octaveShift: settings.octaveShift,
        }),
    };
}

/** Normalizes every snapshot in a persisted undo/redo history state. */
export function normalizeSettingsHistory(state, fallback = DEFAULT_SETTINGS) {
    if (!isSettingsRecord(state) || !Array.isArray(state.past) || !Array.isArray(state.future)) {
        return null;
    }
    if (!isSettingsRecord(state.present)) return null;
    return {
        past: state.past.map((snapshot) => normalizeSettings(snapshot, fallback)),
        present: normalizeSettings(state.present, fallback),
        future: state.future.map((snapshot) => normalizeSettings(snapshot, fallback)),
    };
}

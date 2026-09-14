/**
 * Versioned, serializable settings contract shared by application defaults,
 * presets, persistence, and controller boundaries.
 *
 * @module settings-contract
 */

import {
    ALLOWED_DIRECTIONS,
    ALLOWED_INTERVALS,
    ALLOWED_ROOTS,
    ALLOWED_SCALES,
    ALLOWED_SYNTHS,
    ALLOWED_WAVEFORMS,
} from "./url-preset.js";
import {
    normalizeLoopCount,
    normalizeOfflineExportMode,
    normalizeOfflineExportTailSeconds,
} from "./export-duration.js";
import { normalizeNotesSequence } from "./pattern-core.js";

/** @typedef {Record<string, unknown> & {
 *   bpm: number,
 *   swing: number,
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
 *   notes?: readonly string[]
 * }} ArpeggiatorSettings
 */

/** Increment when a persisted settings migration is required. */
export const SETTINGS_SCHEMA_VERSION = 1;

/**
 * Canonical values used when a session begins, settings are reset, or a
 * partial factory preset is selected. Keep this synchronized with the
 * documented defaults.
 *
 * @type {Readonly<ArpeggiatorSettings>}
 */
export const DEFAULT_SETTINGS = Object.freeze({
    bpm: 120,
    swing: 0,
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

    return {
        ...defaults,
        ...overrides,
        baseNotes: [...baseNotes],
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
export function normalizeSettings(candidate, fallback = DEFAULT_SETTINGS) {
    const source = isSettingsRecord(candidate) ? candidate : {};
    const sourceNotes = source.baseNotes ?? source.notes;
    const notesInput =
        typeof sourceNotes === "string" ||
        (Array.isArray(sourceNotes) && sourceNotes.every((note) => typeof note === "string"))
            ? sourceNotes
            : fallback.baseNotes;
    const normalizedNotes = normalizeNotesSequence(
        typeof notesInput === "string" ? notesInput : [...notesInput],
    );

    return {
        bpm: normalizeNumber(source.bpm, fallback.bpm, 40, 240),
        swing: normalizeNumber(source.swing, fallback.swing, 0, 1),
        postGain: normalizeNumber(source.postGain, fallback.postGain, -40, 0),
        baseNotes: normalizedNotes.length > 0 ? normalizedNotes : [...fallback.baseNotes],
        direction: normalizeAllowedValue(source.direction, ALLOWED_DIRECTIONS, fallback.direction),
        interval: normalizeAllowedValue(source.interval, ALLOWED_INTERVALS, fallback.interval),
        octaveShift: Math.trunc(normalizeNumber(source.octaveShift, fallback.octaveShift, -3, 3)),
        octaveRange: Math.trunc(normalizeNumber(source.octaveRange, fallback.octaveRange, 1, 5)),
        scaleQuantize:
            typeof source.scaleQuantize === "boolean"
                ? source.scaleQuantize
                : fallback.scaleQuantize,
        scaleRoot: normalizeAllowedValue(source.scaleRoot, ALLOWED_ROOTS, fallback.scaleRoot),
        scaleType: normalizeAllowedValue(source.scaleType, ALLOWED_SCALES, fallback.scaleType),
        synthType: normalizeAllowedValue(source.synthType, ALLOWED_SYNTHS, fallback.synthType),
        waveform: normalizeAllowedValue(source.waveform, ALLOWED_WAVEFORMS, fallback.waveform),
        harmonicity: normalizeNumber(source.harmonicity, fallback.harmonicity, 0.5, 10),
        modulationIndex: normalizeNumber(source.modulationIndex, fallback.modulationIndex, 1, 50),
        dutyCycle: normalizeNumber(source.dutyCycle, fallback.dutyCycle, 0.01, 0.99),
        gateRatio: normalizeNumber(source.gateRatio, fallback.gateRatio, 0.05, 1),
        monoCutoff: normalizeNumber(source.monoCutoff, fallback.monoCutoff, 20, 10000),
        monoOctaves: normalizeNumber(source.monoOctaves, fallback.monoOctaves, 0, 8),
        monoQ: normalizeNumber(source.monoQ, fallback.monoQ, 0, 20),
        duoHarm: normalizeNumber(source.duoHarm, fallback.duoHarm, 0.5, 10),
        duoVibrato: normalizeNumber(source.duoVibrato, fallback.duoVibrato, 0, 1),
        pluckDampening: normalizeNumber(source.pluckDampening, fallback.pluckDampening, 0, 10000),
        pluckResonance: normalizeNumber(source.pluckResonance, fallback.pluckResonance, 0, 1),
        pluckNoise: normalizeNumber(source.pluckNoise, fallback.pluckNoise, 0, 10),
        membranePitchDecay: normalizeNumber(
            source.membranePitchDecay,
            fallback.membranePitchDecay,
            0,
            1,
        ),
        membraneOctaves: normalizeNumber(source.membraneOctaves, fallback.membraneOctaves, 0, 16),
        envAttack: normalizeNumber(source.envAttack, fallback.envAttack, 0, 2),
        envDecay: normalizeNumber(source.envDecay, fallback.envDecay, 0, 2),
        envSustain: normalizeNumber(source.envSustain, fallback.envSustain, 0, 1),
        envRelease: normalizeNumber(source.envRelease, fallback.envRelease, 0, 5),
        filterCutoff: normalizeNumber(source.filterCutoff, fallback.filterCutoff, 100, 10000),
        filterResonance: normalizeNumber(source.filterResonance, fallback.filterResonance, 0, 20),
        driveMix: normalizeNumber(source.driveMix, fallback.driveMix, 0, 1),
        chorusMix: normalizeNumber(source.chorusMix, fallback.chorusMix, 0, 1),
        autoPanMix: normalizeNumber(source.autoPanMix, fallback.autoPanMix, 0, 1),
        delayMix: normalizeNumber(source.delayMix, fallback.delayMix, 0, 1),
        reverbMix: normalizeNumber(source.reverbMix, fallback.reverbMix, 0, 1),
        loopCount: normalizeLoopCount(source.loopCount ?? fallback.loopCount),
        offlineExportMode: normalizeOfflineExportMode(
            source.offlineExportMode ?? fallback.offlineExportMode,
        ),
        offlineExportTailSeconds: normalizeOfflineExportTailSeconds(
            source.offlineExportTailSeconds ?? fallback.offlineExportTailSeconds,
        ),
    };
}

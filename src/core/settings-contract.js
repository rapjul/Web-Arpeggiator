/**
 * Versioned, serializable settings contract shared by application defaults,
 * presets, persistence, and controller boundaries.
 *
 * @module settings-contract
 */

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

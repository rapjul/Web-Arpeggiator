/**
 * Pattern Generator Module
 *
 * Bridges the pure domain algorithms in pattern-core.js with Tone.js scheduling.
 *
 * @module pattern-generator
 */

import {
    buildPatternNotesAndMap,
    buildPatternSequence,
    CHROMATIC_PITCHES,
    CHROMATIC_RANGE,
    calculateNoteMarkers,
    getArpeggioNotes,
    materializePatternSequence,
    quantizeToScale,
} from "@core/pattern-core.js";
import * as Tone from "tone";

// Re-export pure domain helpers for backwards compatibility
export {
    buildPatternNotesAndMap,
    buildPatternSequence,
    CHROMATIC_PITCHES,
    CHROMATIC_RANGE,
    calculateNoteMarkers,
    getArpeggioNotes,
    materializePatternSequence,
    quantizeToScale,
};

/**
 * @typedef {object} PatternSettings
 * @property {string[]} baseNotes
 * @property {number} octaveRange
 * @property {number} octaveShift
 * @property {string} interval
 * @property {number} gate
 * @property {string} direction
 * @property {{enabled: boolean, root: string, scale: string}} quantize
 */

/**
 * Builds and owns the active Tone.Pattern. Every application dependency is
 * injected, keeping this scheduler independent of DOM and window globals.
 *
 * @param {{getSynth: () => unknown, getIsPlaying: () => boolean, onPatternChange?: (pattern: Tone.Pattern<string>|null) => void, onStep?: (index: number) => void, logger?: Pick<Console, "error">}} context - Runtime callbacks.
 * @returns {{update: (settings: PatternSettings) => Tone.Pattern<string>|null, getPattern: () => Tone.Pattern<string>|null, dispose: () => void}} Pattern controller API.
 */
export function createPatternController({
    getSynth,
    getIsPlaying,
    onPatternChange = () => {},
    onStep = () => {},
    logger = console,
}) {
    /** @type {Tone.Pattern<string>|null} */
    let pattern = null;
    /** @type {number[]} */
    let stepToBaseIndexMap = [];

    function dispose() {
        if (pattern) {
            try {
                pattern.dispose();
            } catch {}
        }
        pattern = null;
        onPatternChange(null);
    }

    /**
     * @param {PatternSettings} settings - Materialized settings snapshot.
     * @returns {Tone.Pattern<string>|null} The new pattern, or null for no notes.
     */
    function update(settings) {
        try {
            const {
                finalNotes,
                stepToBaseIndexMap: computedMap,
                finalDirection,
            } = buildPatternSequence(settings.baseNotes, {
                direction: settings.direction,
                octaveRange: settings.octaveRange,
                octaveShift: settings.octaveShift,
                quantize: settings.quantize,
            });

            dispose();
            stepToBaseIndexMap = computedMap;
            if (finalNotes.length === 0) return null;

            /** @type {string|number} */
            let patternInterval = settings.interval;
            let durationSeconds = 0.1;
            try {
                durationSeconds = Tone.Time(patternInterval).toSeconds() * settings.gate;
            } catch {
                patternInterval = 0.1;
                durationSeconds = 0.1 * settings.gate;
            }

            const patternInstance = new Tone.Pattern(
                (time, note) => {
                    const synth = getSynth();
                    if (isTriggerableSynth(synth)) {
                        triggerSynth(synth, note, time, durationSeconds);
                    }

                    const patternIndex = patternInstance.index;
                    const pipIndex = stepToBaseIndexMap[patternIndex] ?? 0;
                    Tone.Draw.schedule(() => onStep(pipIndex), time);
                },
                finalNotes,
                finalDirection,
            );

            patternInstance.interval = patternInterval;
            pattern = patternInstance;
            onPatternChange(pattern);
            if (getIsPlaying()) pattern.start(0);
            return pattern;
        } catch (error) {
            logger.error("createOrUpdatePattern error", error);
            return pattern;
        }
    }

    return { update, getPattern: () => pattern, dispose };
}

/**
 * @param {unknown} synth - Candidate Tone synth.
 * @returns {synth is {triggerAttack?: (note: string, time?: number) => void, triggerRelease?: (time: number|string) => void, triggerAttackRelease?: (note: string, duration: number, time?: number) => void}} Whether scheduling methods are available.
 */
function isTriggerableSynth(synth) {
    return typeof synth === "object" && synth !== null;
}

/**
 * @param {{triggerAttack?: (note: string, time?: number) => void, triggerRelease?: (time: number|string) => void, triggerAttackRelease?: (note: string, duration: number, time?: number) => void}} synth - Active synth.
 * @param {string} note - Note to trigger.
 * @param {number} time - AudioContext time.
 * @param {number} durationSeconds - Note duration.
 * @returns {void}
 */
function triggerSynth(synth, note, time, durationSeconds) {
    try {
        if (
            typeof synth.triggerAttack === "function" &&
            typeof synth.triggerRelease === "function"
        ) {
            synth.triggerAttack(note, time);
            synth.triggerRelease(time + durationSeconds);
        } else if (typeof synth.triggerAttackRelease === "function") {
            synth.triggerAttackRelease(note, durationSeconds, time);
        }
    } catch {
        try {
            if (
                typeof synth.triggerAttack === "function" &&
                typeof synth.triggerRelease === "function"
            ) {
                synth.triggerAttack(note);
                synth.triggerRelease(`+${durationSeconds}`);
            } else if (typeof synth.triggerAttackRelease === "function") {
                synth.triggerAttackRelease(note, durationSeconds);
            }
        } catch {}
    }
}

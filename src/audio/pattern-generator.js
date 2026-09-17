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
import { compileTimeline, ticksToSeconds } from "@core/timeline.js";
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
 * @property {number} [bpm]
 * @property {number} [swing]
 */

/**
 * Builds and owns the active timeline-backed Tone.Pattern. Every application dependency is
 * injected, keeping this scheduler independent of DOM and window globals.
 *
 * @param {{getSynth: () => unknown, getIsPlaying: () => boolean, onPatternChange?: (pattern: object|null) => void, onStep?: (index: number) => void, logger?: Pick<Console, "error">}} context - Runtime callbacks.
 * @returns {{update: (settings: PatternSettings) => object|null, getPattern: () => object|null, dispose: () => void}} Pattern controller API.
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
     * @returns {object|null} The new timeline-backed pattern, or null for no notes.
     */
    function update(settings) {
        try {
            const timeline = compileTimeline(
                {
                    baseNotes: settings.baseNotes,
                    direction: settings.direction,
                    octaveRange: settings.octaveRange,
                    octaveShift: settings.octaveShift,
                    quantize: settings.quantize,
                    interval: settings.interval,
                    gateRatio: settings.gate,
                    bpm: settings.bpm,
                    swing: settings.swing,
                },
                { cycles: 1 },
            );

            dispose();
            if (timeline.events.length === 0) return null;

            const patternInstance = new Tone.Pattern(
                (time, note) => {
                    const event =
                        timeline.events[patternInstance.index % timeline.stepsPerCycle] ??
                        timeline.events[0];
                    const scheduledTime =
                        time + ticksToSeconds(event.swingOffsetTicks, timeline.bpm);
                    const synth = getSynth();
                    if (isTriggerableSynth(synth)) {
                        triggerSynth(
                            synth,
                            note,
                            scheduledTime,
                            ticksToSeconds(event.durationTicks, timeline.bpm),
                        );
                    }

                    Tone.Draw.schedule(() => onStep(event.sourceNoteIndex), scheduledTime);
                },
                timeline.resolvedNotes,
                "up",
            );
            patternInstance.interval = timeline.interval;
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

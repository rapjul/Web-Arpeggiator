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
    createPatternSequenceCursor,
    getArpeggioNotes,
    materializePatternSequence,
    quantizeToScale,
} from "@core/pattern-core.js";
import { compileTimeline, getTimelineStartTick, ticksToSeconds } from "@core/timeline.js";
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
 * @property {number} [randomSeed]
 */

/**
 * Builds and owns the active timeline-backed Tone.Pattern. Every application dependency is
 * injected, keeping this scheduler independent of DOM and window globals.
 *
 * @param {{getSynth: () => unknown, getIsPlaying: () => boolean, onPatternChange?: (pattern: object|null) => void, onStep?: (index: number) => void, logger?: Pick<Console, "error">}} context - Runtime callbacks.
 * @returns {{update: (settings: PatternSettings) => object|null, getPattern: () => object|null, getTimeline: () => import("@core/timeline.js").CompiledTimeline|null, dispose: () => void, silenceActiveSynth: () => void}} Pattern controller API.
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
    /** @type {import("@core/timeline.js").CompiledTimeline|null} */
    let currentTimeline = null;

    /** @returns {void} Releases active synth voices and disposes the current pattern. */
    function dispose() {
        if (pattern) {
            silenceActiveSynth();
            try {
                pattern.dispose();
            } catch {}
        }
        pattern = null;
        currentTimeline = null;
        onPatternChange(null);
    }

    /**
     * Cancels any pending scheduled synth attacks and releases active voices
     * so that notes do not sound after transport stoppage or pattern replacement.
     *
     * @returns {void}
     */
    function silenceActiveSynth() {
        const synth = getSynth();
        if (!synth || typeof synth !== "object") return;
        try {
            if (typeof (/** @type {*} */ (synth).triggerRelease) === "function") {
                /** @type {*} */ (synth).triggerRelease();
            }
        } catch {}
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
                    randomSeed: settings.randomSeed,
                },
                { cycles: 1 },
            );

            dispose();
            if (timeline.events.length === 0) return null;
            currentTimeline = timeline;

            let occurrenceIndex = 0;
            const stepDurationSeconds = ticksToSeconds(timeline.stepDurationTicks, timeline.bpm);
            if (getIsPlaying() && stepDurationSeconds > 0) {
                occurrenceIndex = Math.max(
                    0,
                    Math.floor(Tone.getTransport().seconds / stepDurationSeconds),
                );
            }
            let activeCycleIndex = -1;
            let activeSequence = { notes: timeline.resolvedNotes, map: timeline.sourceNoteMap };
            const liveCursor = createPatternSequenceCursor(settings.baseNotes, {
                direction: settings.direction,
                octaveRange: settings.octaveRange,
                octaveShift: settings.octaveShift,
                quantize: settings.quantize,
                randomSeed: timeline.randomSeed,
            });
            // Fast-forward the cursor to the active cycle when resuming mid-playback
            const resumeCycleIndex = Math.floor(occurrenceIndex / timeline.stepsPerCycle);
            for (let i = 0; i <= resumeCycleIndex; i++) {
                activeSequence = liveCursor.nextCycle();
                activeCycleIndex = i;
            }
            const patternInstance = new Tone.Pattern(
                (time) => {
                    const stepIndex =
                        typeof patternInstance.index === "number"
                            ? patternInstance.index % timeline.stepsPerCycle
                            : occurrenceIndex % timeline.stepsPerCycle;
                    const cycleIndex = Math.floor(occurrenceIndex / timeline.stepsPerCycle);
                    if (cycleIndex !== activeCycleIndex) {
                        activeSequence = liveCursor.nextCycle();
                        activeCycleIndex = cycleIndex;
                    }
                    const note = activeSequence.notes[stepIndex] ?? activeSequence.notes[0];
                    const sourceNoteIndex = activeSequence.map[stepIndex] ?? 0;
                    const swungStartTick = getTimelineStartTick(
                        occurrenceIndex,
                        timeline.stepDurationTicks,
                        timeline.swing,
                    );
                    const rawStartTick = occurrenceIndex * timeline.stepDurationTicks;
                    const nextStartTick = getTimelineStartTick(
                        occurrenceIndex + 1,
                        timeline.stepDurationTicks,
                        timeline.swing,
                    );
                    const nominalDurationTicks =
                        timeline.events[0]?.nominalDurationTicks ??
                        Math.max(1, Math.round(timeline.stepDurationTicks * timeline.gateRatio));
                    const durationTicks = Math.min(
                        nominalDurationTicks,
                        Math.max(1, nextStartTick - swungStartTick),
                    );
                    const swingOffsetTicks = swungStartTick - rawStartTick;
                    occurrenceIndex += 1;
                    const scheduledTime = time + ticksToSeconds(swingOffsetTicks, timeline.bpm);
                    const synth = getSynth();
                    if (note && isTriggerableSynth(synth)) {
                        triggerSynth(
                            synth,
                            note,
                            scheduledTime,
                            ticksToSeconds(durationTicks, timeline.bpm),
                        );
                    }

                    Tone.Draw.schedule(() => {
                        if (getIsPlaying()) onStep(sourceNoteIndex);
                    }, scheduledTime);
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

    return {
        update,
        getPattern: () => pattern,
        getTimeline: () => currentTimeline,
        dispose,
        silenceActiveSynth,
    };
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

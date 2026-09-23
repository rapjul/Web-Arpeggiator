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
import {
    TICKS_PER_BEAT,
    compileTimeline,
    getTimelineStartTick,
    ticksToSeconds,
} from "@core/timeline.js";
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
 * Resolves the active Tone transport PPQ resolution.
 *
 * @param {*} [transport] - Active Tone.Transport instance.
 * @returns {number} Transport pulses per quarter note.
 */
function getTransportPpq(transport) {
    return typeof transport?.PPQ === "number" && transport.PPQ > 0 ? transport.PPQ : 192;
}

/**
 * Converts timeline 480-PPQ ticks to transport ticks using active transport PPQ.
 *
 * @param {number} timelineTicks - Ticks at 480 PPQ.
 * @param {number} transportPpq - Transport pulses per quarter note.
 * @returns {number} Equivalent transport ticks.
 */
function timelineTicksToTransportTicks(timelineTicks, transportPpq) {
    return Math.round((timelineTicks * transportPpq) / TICKS_PER_BEAT);
}

/**
 * Builds and owns the active timeline-backed Tone.Pattern. Every application dependency is
 * injected, keeping this scheduler independent of DOM and window globals.
 *
 * @param {{getSynth: () => unknown, getIsPlaying: () => boolean, onPatternChange?: (pattern: object|null) => void, onStep?: (index: number) => void, logger?: Pick<Console, "error">}} context - Runtime callbacks.
 * @returns {{update: (settings: PatternSettings) => object|null, getPattern: () => object|null, getTimeline: () => import("@core/timeline.js").CompiledTimeline|null, dispose: (options?: {silenceVoices?: boolean}) => void, silenceActiveSynth: () => void, cancelQueuedSynthEvents: (synthToCancel?: unknown, cancelTime?: number) => void}} Pattern controller API.
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
    /** @type {unknown} */
    let currentSynth = null;
    /** @type {Set<number>} */
    const pendingTransportAttackIds = new Set();
    let activeNoteReleaseTime = 0;

    /**
     * Clears any attacks scheduled on the transport for future swing offsets.
     *
     * @returns {void}
     */
    function clearPendingTransportAttacks() {
        const transport = Tone.getTransport();
        if (transport && typeof transport.clear === "function") {
            for (const eventId of pendingTransportAttackIds) {
                try {
                    transport.clear(eventId);
                } catch {}
            }
        }
        pendingTransportAttackIds.clear();
    }

    /**
     * Cancels any future queued envelope events on a synth without cutting
     * currently active voice output.
     *
     * @param {unknown} [synthToCancel] - Candidate synth instance.
     * @param {number} [cancelTime] - Time threshold after which to cancel events.
     * @returns {void}
     */
    function cancelQueuedSynthEvents(synthToCancel, cancelTime) {
        clearPendingTransportAttacks();
        const synth = synthToCancel ?? getSynth();
        if (!synth || typeof synth !== "object") return;
        const now = cancelTime ?? Tone.now();
        const candidateEnvelopes = [
            /** @type {*} */ (synth).envelope,
            /** @type {*} */ (synth).modulationEnvelope,
            /** @type {*} */ (synth).filterEnvelope,
            /** @type {*} */ (synth).voice0?.envelope,
            /** @type {*} */ (synth).voice0?.filterEnvelope,
            /** @type {*} */ (synth).voice1?.envelope,
            /** @type {*} */ (synth).voice1?.filterEnvelope,
        ];
        for (const env of candidateEnvelopes) {
            if (env && typeof env.cancel === "function") {
                try {
                    env.cancel(now);
                } catch {}
            }
        }
        // Non-envelope synths (e.g. Tone.PluckSynth excitation and comb resonance)
        const nonEnv = /** @type {*} */ (synth);
        if (typeof nonEnv._noise?.stop === "function") {
            try {
                nonEnv._noise.stop(now);
            } catch {}
        }
        if (typeof nonEnv._lfcf?.resonance?.cancelScheduledValues === "function") {
            try {
                const configuredResonance =
                    typeof nonEnv._savedResonance === "number"
                        ? nonEnv._savedResonance
                        : typeof nonEnv.resonance === "number" && nonEnv.resonance > 0
                          ? nonEnv.resonance
                          : 0.9;
                nonEnv._savedResonance = configuredResonance;
                nonEnv._lfcf.resonance.cancelScheduledValues(now);
                nonEnv._lfcf.resonance.setValueAtTime(0, now);
                nonEnv._lfcf.resonance.setValueAtTime(configuredResonance, now + 0.05);
            } catch {}
        }
    }

    /**
     * @param {unknown} [synthToSilence] - Synth instance to release.
     * @returns {void}
     */
    function silenceSynth(synthToSilence) {
        const synth = synthToSilence ?? getSynth();
        if (!synth || typeof synth !== "object") return;
        cancelQueuedSynthEvents(synth);
        try {
            if (typeof (/** @type {*} */ (synth).triggerRelease) === "function") {
                /** @type {*} */ (synth).triggerRelease();
            }
        } catch {}
    }

    /**
     * Cancels any pending scheduled synth attacks and releases active voices
     * so that notes do not sound after transport stoppage or instrument change.
     *
     * @returns {void}
     */
    function silenceActiveSynth() {
        activeNoteReleaseTime = 0;
        const active = getSynth();
        silenceSynth(currentSynth);
        if (active !== currentSynth) {
            silenceSynth(active);
        }
    }

    /**
     * Disposes the current pattern scheduler.
     *
     * @param {{ silenceVoices?: boolean }} [options] - Whether to release active sounding voices.
     * @returns {void}
     */
    function dispose({ silenceVoices = true } = {}) {
        clearPendingTransportAttacks();
        if (pattern) {
            if (silenceVoices) {
                silenceActiveSynth();
            } else {
                // Cancel future queued attacks from the replaced pattern without cutting off
                // the active sounding note before the new pattern sequence takes over
                const now = Tone.now();
                const cancelFrom = activeNoteReleaseTime > now ? activeNoteReleaseTime : now;
                const rescheduleRelease = (synthToCancel) => {
                    cancelQueuedSynthEvents(synthToCancel, cancelFrom);
                    if (
                        cancelFrom > now &&
                        typeof (/** @type {*} */ (synthToCancel)?.triggerRelease) === "function"
                    ) {
                        try {
                            /** @type {*} */ (synthToCancel).triggerRelease(cancelFrom);
                        } catch {}
                    }
                };
                rescheduleRelease(currentSynth);
                const active = getSynth();
                if (active !== currentSynth) {
                    rescheduleRelease(active);
                }
            }
            try {
                pattern.dispose();
            } catch {}
        }
        pattern = null;
        currentSynth = null;
        currentTimeline = null;
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
                    randomSeed: settings.randomSeed,
                },
                { cycles: 1 },
            );

            const hasEvents = timeline.events.length > 0;
            dispose({ silenceVoices: !getIsPlaying() || !hasEvents });
            if (!hasEvents) return null;
            currentTimeline = timeline;
            currentSynth = getSynth();

            let occurrenceIndex = 0;
            if (getIsPlaying()) {
                const transport = Tone.getTransport();
                const transportTicks = typeof transport?.ticks === "number" ? transport.ticks : 0;
                const ppq = getTransportPpq(transport);
                const stepTransportTicks = timelineTicksToTransportTicks(
                    timeline.stepDurationTicks,
                    ppq,
                );
                if (stepTransportTicks > 0 && transportTicks > 0) {
                    occurrenceIndex = Math.ceil(transportTicks / stepTransportTicks);
                }
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
                    const stepIndex = occurrenceIndex % timeline.stepsPerCycle;
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
                    const synth = currentSynth ?? getSynth();
                    if (note && isTriggerableSynth(synth)) {
                        const durationSeconds = ticksToSeconds(durationTicks, timeline.bpm);
                        const transport = Tone.getTransport();
                        if (
                            getIsPlaying() &&
                            swingOffsetTicks > 0 &&
                            transport &&
                            typeof transport.scheduleOnce === "function"
                        ) {
                            const ppq = getTransportPpq(transport);
                            const transportTick = timelineTicksToTransportTicks(
                                swungStartTick,
                                ppq,
                            );
                            const eventId = transport.scheduleOnce((attackTime) => {
                                pendingTransportAttackIds.delete(eventId);
                                activeNoteReleaseTime = attackTime + durationSeconds;
                                triggerSynth(synth, note, attackTime, durationSeconds);
                            }, `${transportTick}i`);
                            pendingTransportAttackIds.add(eventId);
                        } else {
                            activeNoteReleaseTime = scheduledTime + durationSeconds;
                            triggerSynth(synth, note, scheduledTime, durationSeconds);
                        }
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
        cancelQueuedSynthEvents,
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
    const nonEnv = /** @type {*} */ (synth);
    if (
        typeof nonEnv?._savedResonance === "number" &&
        typeof nonEnv._lfcf?.resonance?.setValueAtTime === "function"
    ) {
        try {
            nonEnv._lfcf.resonance.cancelScheduledValues(time);
            nonEnv._lfcf.resonance.setValueAtTime(nonEnv._savedResonance, time);
        } catch {}
    }
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

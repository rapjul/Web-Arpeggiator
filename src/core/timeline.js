/**
 * Pure musical timeline compiler shared by live playback, offline rendering,
 * visual timing, and MIDI export.
 *
 * @module timeline
 */

import { materializePatternSequence } from "./pattern-core.js";

/** Standard MIDI-style resolution used by the application timeline. */
export const TICKS_PER_BEAT = 480;

/** @type {Readonly<Record<string, number>>} */
export const INTERVAL_TICKS = Object.freeze({
    "64n": 30,
    "32n": 60,
    "16n": 120,
    "8n": 240,
    "4n": 480,
    "2n": 960,
});

export const DEFAULT_TIMELINE_BPM = 120;
export const DEFAULT_TIMELINE_INTERVAL = "16n";
export const DEFAULT_TIMELINE_GATE = 0.8;
export const DEFAULT_TIMELINE_VELOCITY = 100;
export const MIN_TIMELINE_CYCLES = 1;
export const MAX_TIMELINE_CYCLES = 100;

/**
 * @typedef {object} TimelineEvent
 * @property {string} pitch - Resolved note name.
 * @property {number} startTick - Scheduled start in 480-PPQ ticks.
 * @property {number} durationTicks - Effective gate duration in ticks.
 * @property {number} nominalDurationTicks - Requested gate duration in ticks.
 * @property {number} velocity - MIDI-style velocity from 1 through 127.
 * @property {number} sourceNoteIndex - Index in the authored base-note list.
 * @property {number} sourceStepIndex - Index in the resolved one-cycle sequence.
 * @property {number} cycleIndex - Zero-based cycle containing the event.
 * @property {number} stepIndex - Zero-based step within the cycle.
 * @property {number} rawStartTick - Unswing start position in ticks.
 * @property {number} swingOffsetTicks - Applied swing offset in ticks.
 */

/**
 * @typedef {object} CompiledTimeline
 * @property {TimelineEvent[]} events - Resolved scheduled events.
 * @property {string[]} resolvedNotes - One-cycle resolved note sequence.
 * @property {number[]} sourceNoteMap - One-cycle source-note mapping.
 * @property {number} stepsPerCycle - Number of events in one cycle.
 * @property {number} stepDurationTicks - Unswing step duration.
 * @property {number} cycleDurationTicks - Complete one-cycle duration.
 * @property {number} musicalDurationTicks - Complete duration for all requested cycles.
 * @property {number} gateRatio - Normalized requested gate ratio.
 * @property {number} bpm - Normalized tempo.
 * @property {number} swing - Normalized swing amount.
 * @property {number} cycles - Normalized cycle count.
 */

/**
 * Normalizes a finite integer inside an inclusive range.
 *
 * @param {unknown} value - Candidate value.
 * @param {number} fallback - Fallback value.
 * @param {number} minimum - Inclusive minimum.
 * @param {number} maximum - Inclusive maximum.
 * @returns {number} Normalized integer.
 */
function normalizeInteger(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

/**
 * Normalizes a finite number inside an inclusive range.
 *
 * @param {unknown} value - Candidate value.
 * @param {number} fallback - Fallback value.
 * @param {number} minimum - Inclusive minimum.
 * @param {number} maximum - Inclusive maximum.
 * @returns {number} Normalized number.
 */
function normalizeNumber(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, minimum), maximum);
}

/**
 * Converts an interval identifier to the shared integer tick duration.
 *
 * @param {unknown} interval - Tone-style interval identifier.
 * @returns {number} Step duration in ticks.
 */
export function getIntervalTicks(interval) {
    return typeof interval === "string" && INTERVAL_TICKS[interval]
        ? INTERVAL_TICKS[interval]
        : INTERVAL_TICKS[DEFAULT_TIMELINE_INTERVAL];
}

/**
 * Converts timeline ticks to seconds at a constant tempo.
 *
 * @param {unknown} ticks - Number of 480-PPQ ticks.
 * @param {unknown} bpm - Tempo in beats per minute.
 * @returns {number} Duration in seconds.
 */
export function ticksToSeconds(ticks, bpm) {
    const safeTicks = Number.isFinite(Number(ticks)) ? Number(ticks) : 0;
    const safeBpm = normalizeNumber(bpm, DEFAULT_TIMELINE_BPM, 1, 1000);
    return (safeTicks / TICKS_PER_BEAT) * (60 / safeBpm);
}

/**
 * Matches Tone.Transport's default 8th-note swing calculation at 480 PPQ.
 * The result is rounded to one timeline tick so all consumers share the same
 * integer timing contract.
 *
 * @param {number} startTick - Unswing event start tick.
 * @param {unknown} swing - Swing amount from 0 through 1.
 * @returns {number} Swing offset in ticks.
 */
export function getSwingOffsetTicks(startTick, swing) {
    const safeStartTick = Math.max(0, Math.trunc(Number(startTick) || 0));
    const safeSwing = normalizeNumber(swing, 0, 0, 1);
    const swingSubdivisionTicks = TICKS_PER_BEAT / 2;
    const swingCycleTicks = swingSubdivisionTicks * 2;

    if (
        safeSwing <= 0 ||
        safeStartTick % TICKS_PER_BEAT === 0 ||
        safeStartTick % swingCycleTicks === 0
    ) {
        return 0;
    }

    const progress = (safeStartTick % swingCycleTicks) / swingCycleTicks;
    const amount = Math.sin(progress * Math.PI) * safeSwing;
    return Math.round(((swingSubdivisionTicks * 2) / 3) * amount);
}

/**
 * Returns the note source configuration accepted by the timeline compiler.
 *
 * @param {Record<string, unknown>} settings - Candidate settings.
 * @returns {{baseNotes: string[], direction: string, octaveRange: number, octaveShift: number, quantize: {enabled: boolean, root: string, scale: string}, interval: string, gate: number, bpm: number, swing: number, velocity: number}}
 */
function normalizeTimelineSettings(settings) {
    const rawBaseNotes = settings.baseNotes ?? settings.notes;
    const baseNotes = Array.isArray(rawBaseNotes)
        ? rawBaseNotes.filter((note) => typeof note === "string")
        : typeof rawBaseNotes === "string"
          ? rawBaseNotes.trim().split(/\s+/).filter(Boolean)
          : [];
    const rawQuantize =
        settings.quantize && typeof settings.quantize === "object" ? settings.quantize : {};
    const quantize = /** @type {Record<string, unknown>} */ (rawQuantize);

    return {
        baseNotes,
        direction: typeof settings.direction === "string" ? settings.direction : "up",
        octaveRange: normalizeInteger(settings.octaveRange, 1, 1, 5),
        octaveShift: normalizeInteger(settings.octaveShift, 0, -3, 3),
        quantize: {
            enabled:
                typeof quantize.enabled === "boolean"
                    ? quantize.enabled
                    : settings.scaleQuantize === true,
            root:
                typeof quantize.root === "string"
                    ? quantize.root
                    : typeof settings.scaleRoot === "string"
                      ? settings.scaleRoot
                      : "C",
            scale:
                typeof quantize.scale === "string"
                    ? quantize.scale
                    : typeof settings.scaleType === "string"
                      ? settings.scaleType
                      : "major",
        },
        interval:
            typeof settings.interval === "string" ? settings.interval : DEFAULT_TIMELINE_INTERVAL,
        gate: normalizeNumber(settings.gate ?? settings.gateRatio, DEFAULT_TIMELINE_GATE, 0.05, 1),
        bpm: normalizeNumber(settings.bpm, DEFAULT_TIMELINE_BPM, 1, 1000),
        swing: normalizeNumber(settings.swing, 0, 0, 1),
        velocity: normalizeInteger(settings.velocity, DEFAULT_TIMELINE_VELOCITY, 1, 127),
    };
}

/**
 * Compiles a finite, deterministic musical timeline.
 *
 * @param {Record<string, unknown>} [settings={}] - Musical settings snapshot.
 * @param {{cycles?: unknown, rng?: () => number}} [range={}] - Requested render range and random source.
 * @returns {CompiledTimeline} Immutable-by-convention compiled timeline data.
 */
export function compileTimeline(settings = {}, range = {}) {
    const sourceSettings = settings && typeof settings === "object" ? settings : {};
    const normalized = normalizeTimelineSettings(sourceSettings);
    const cycles = normalizeInteger(
        range.cycles ?? sourceSettings.loopCount,
        MIN_TIMELINE_CYCLES,
        MIN_TIMELINE_CYCLES,
        MAX_TIMELINE_CYCLES,
    );
    const sequence = materializePatternSequence(normalized.baseNotes, {
        direction: normalized.direction,
        octaveRange: normalized.octaveRange,
        octaveShift: normalized.octaveShift,
        quantize: normalized.quantize,
        rng: typeof range.rng === "function" ? range.rng : Math.random,
    });
    const stepDurationTicks = getIntervalTicks(normalized.interval);
    const stepsPerCycle = sequence.notes.length;
    const cycleDurationTicks = stepsPerCycle * stepDurationTicks;
    const musicalDurationTicks = cycleDurationTicks * cycles;
    const nominalDurationTicks = Math.max(1, Math.round(stepDurationTicks * normalized.gate));

    /** @type {TimelineEvent[]} */
    const rawEvents = [];
    for (let cycleIndex = 0; cycleIndex < cycles; cycleIndex += 1) {
        for (let stepIndex = 0; stepIndex < stepsPerCycle; stepIndex += 1) {
            const sourceStepIndex = stepIndex;
            const rawStartTick = cycleIndex * cycleDurationTicks + stepIndex * stepDurationTicks;
            const swingOffsetTicks = getSwingOffsetTicks(rawStartTick, normalized.swing);
            rawEvents.push({
                pitch: sequence.notes[sourceStepIndex],
                startTick: rawStartTick + swingOffsetTicks,
                durationTicks: nominalDurationTicks,
                nominalDurationTicks,
                velocity: normalized.velocity,
                sourceNoteIndex: sequence.map[sourceStepIndex] ?? 0,
                sourceStepIndex,
                cycleIndex,
                stepIndex,
                rawStartTick,
                swingOffsetTicks,
            });
        }
    }

    const events = rawEvents.map((event, index) => {
        const nextStartTick = rawEvents[index + 1]?.startTick ?? musicalDurationTicks;
        const availableDurationTicks = Math.max(1, nextStartTick - event.startTick);
        return {
            ...event,
            durationTicks: Math.min(event.nominalDurationTicks, availableDurationTicks),
        };
    });

    return {
        events,
        resolvedNotes: [...sequence.notes],
        sourceNoteMap: [...sequence.map],
        stepsPerCycle,
        stepDurationTicks,
        cycleDurationTicks,
        musicalDurationTicks,
        gateRatio: normalized.gate,
        bpm: normalized.bpm,
        swing: normalized.swing,
        cycles,
    };
}

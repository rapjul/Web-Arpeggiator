/**
 * Pure musical timeline compiler shared by live playback, offline rendering,
 * visual timing, and MIDI export.
 *
 * @module timeline
 */

import { createPatternSequenceCursor } from "./pattern-core.js";
import { DEFAULT_RANDOM_SEED, normalizeRandomSeed } from "./random-seed.js";
import { DEFAULT_BPM, MAX_BPM, MIN_BPM } from "./timing-constants.js";

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

export const DEFAULT_TIMELINE_BPM = DEFAULT_BPM;
export const DEFAULT_TIMELINE_INTERVAL = "16n";
export const DEFAULT_TIMELINE_GATE = 0.8;
export const DEFAULT_TIMELINE_VELOCITY = 100;
export const MIN_TIMELINE_CYCLES = 1;
export const MAX_TIMELINE_CYCLES = 100;
const MAX_INTERNAL_TIMELINE_CYCLES = MAX_TIMELINE_CYCLES * 100;

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
 * @property {string[]} scheduledNotes - Flattened notes scheduled for the requested range.
 * @property {number[]} sourceNoteMap - One-cycle source-note mapping.
 * @property {number} stepsPerCycle - Number of events in one cycle.
 * @property {number} stepDurationTicks - Unswing step duration.
 * @property {number} cycleDurationTicks - Complete one-cycle duration.
 * @property {number} musicalDurationTicks - Complete duration for all requested cycles.
 * @property {number} gateRatio - Normalized requested gate ratio.
 * @property {number} bpm - Normalized tempo.
 * @property {number} swing - Normalized swing amount.
 * @property {number} cycles - Normalized cycle count.
 * @property {string} interval - Normalized interval identifier.
 * @property {number} randomSeed - Normalized unsigned random seed.
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
    const safeBpm = normalizeNumber(bpm, DEFAULT_TIMELINE_BPM, MIN_BPM, MAX_BPM);
    return (safeTicks / TICKS_PER_BEAT) * (60 / safeBpm);
}

/**
 * Returns the end tick of the final scheduled note, including its gate.
 *
 * @param {{events?: TimelineEvent[]}|null|undefined} timeline - Candidate compiled timeline.
 * @returns {number} Last release tick, or zero for an empty timeline.
 */
export function getTimelineEndTick(timeline) {
    if (!timeline || !Array.isArray(timeline.events)) return 0;
    return timeline.events.reduce(
        (endTick, event) => Math.max(endTick, event.startTick + event.durationTicks),
        0,
    );
}

/**
 * Repeats a selected timeline as cyclic source material before its export
 * region. Every copied event keeps its selected start and gate offsets, which
 * prevents warm-up scheduling from recalculating a different swing phase.
 *
 * @param {CompiledTimeline} timeline - Selected export timeline.
 * @param {unknown} preRollTicks - Integer warm-up duration before the selected region.
 * @returns {TimelineEvent[]} Events from the warm-up through the selected range.
 */
export function createCyclicRenderEvents(timeline, preRollTicks) {
    if (!timeline || !Array.isArray(timeline.events) || timeline.events.length === 0) {
        return [];
    }

    const sourceDurationTicks = Math.max(0, Math.trunc(Number(timeline.musicalDurationTicks)) || 0);
    if (sourceDurationTicks === 0) return [];

    const safePreRollTicks = Math.max(0, Math.trunc(Number(preRollTicks)) || 0);
    const renderEndTick = safePreRollTicks + sourceDurationTicks;
    const firstCopyIndex = -Math.ceil(safePreRollTicks / sourceDurationTicks);
    /** @type {TimelineEvent[]} */
    const events = [];

    for (let copyIndex = firstCopyIndex; copyIndex <= 0; copyIndex += 1) {
        const offsetTicks = safePreRollTicks + copyIndex * sourceDurationTicks;
        timeline.events.forEach((event) => {
            const startTick = offsetTicks + event.startTick;
            if (startTick < 0 || startTick >= renderEndTick) return;
            events.push({
                ...event,
                startTick,
                rawStartTick: offsetTicks + event.rawStartTick,
            });
        });
    }

    return events;
}

/**
 * Returns the bounded swung start for an absolute zero-based occurrence.
 * Preserves Tone.js-calculated swing offsets while bounding starts within
 * their intra-beat window to prevent event collisions or downbeat overshoot
 * on fine subdivisions.
 *
 * @param {number} occurrenceIndex - Zero-based step occurrence count.
 * @param {number} stepDurationTicks - Unswung step duration in 480-PPQ ticks.
 * @param {unknown} swing - Swing amount from 0 through 1.
 * @returns {number} Integer start tick for the occurrence.
 */
export function getTimelineStartTick(occurrenceIndex, stepDurationTicks, swing) {
    const safeOccurrence = Math.max(0, Math.trunc(Number(occurrenceIndex) || 0));
    const safeStepDuration = Math.max(1, Math.trunc(Number(stepDurationTicks) || 1));
    const rawStartTick = safeOccurrence * safeStepDuration;
    const requestedTick = rawStartTick + getSwingOffsetTicks(rawStartTick, swing);
    const nextBeatTick = (Math.floor(rawStartTick / TICKS_PER_BEAT) + 1) * TICKS_PER_BEAT;
    const stepsRemaining = Math.max(1, (nextBeatTick - rawStartTick) / safeStepDuration);
    const maxTick = nextBeatTick - stepsRemaining;
    return Math.min(requestedTick, maxTick);
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
 * Determines whether a duration ends at the same swing phase where it began.
 *
 * @param {unknown} durationTicks - Candidate duration in timeline ticks.
 * @param {unknown} swing - Swing amount from 0 through 1.
 * @returns {boolean} Whether a repeated range preserves the swing phase.
 */
export function isSwingPhaseAligned(durationTicks, swing) {
    const safeDuration = Math.max(0, Math.trunc(Number(durationTicks) || 0));
    const safeSwing = normalizeNumber(swing, 0, 0, 1);
    return safeSwing === 0 || safeDuration === 0 || safeDuration % TICKS_PER_BEAT === 0;
}

/**
 * Returns how many pattern cycles make a complete swing-phase repetition.
 *
 * @param {unknown} cycleDurationTicks - One pattern-cycle duration in timeline ticks.
 * @param {unknown} swing - Swing amount from 0 through 1.
 * @returns {number} Number of cycles required for a seamless phase boundary.
 */
export function getSwingPhaseCycleCount(cycleDurationTicks, swing) {
    const safeDuration = Math.max(0, Math.trunc(Number(cycleDurationTicks) || 0));
    const safeSwing = normalizeNumber(swing, 0, 0, 1);
    if (safeSwing === 0 || safeDuration === 0) return 1;

    let divisor = TICKS_PER_BEAT;
    let remainder = safeDuration % TICKS_PER_BEAT;
    while (remainder !== 0) {
        const nextRemainder = divisor % remainder;
        divisor = remainder;
        remainder = nextRemainder;
    }
    return TICKS_PER_BEAT / divisor;
}

/**
 * Returns the note source configuration accepted by the timeline compiler.
 *
 * @param {Record<string, unknown>} settings - Candidate settings.
 * @returns {{baseNotes: string[], direction: string, octaveRange: number, octaveShift: number, quantize: {enabled: boolean, root: string, scale: string}, interval: string, gate: number, bpm: number, swing: number, velocity: number, randomSeed: number}}
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
        bpm: normalizeNumber(settings.bpm, DEFAULT_TIMELINE_BPM, MIN_BPM, MAX_BPM),
        swing: normalizeNumber(settings.swing, 0, 0, 1),
        velocity: normalizeInteger(settings.velocity, DEFAULT_TIMELINE_VELOCITY, 1, 127),
        randomSeed: normalizeRandomSeed(settings.randomSeed, DEFAULT_RANDOM_SEED),
    };
}

/**
 * Compiles a finite, deterministic musical timeline.
 *
 * @param {Record<string, unknown>} [settings={}] - Musical settings snapshot.
 * @param {{cycles?: unknown, maxCycles?: unknown, rng?: () => number, resolvedNotes?: unknown, sourceNoteMap?: unknown, terminalGatePolicy?: "clip"|"preserve"}} [range={}] - Requested render range and random source.
 * @returns {CompiledTimeline} Immutable-by-convention compiled timeline data.
 */
export function compileTimeline(settings = {}, range = {}) {
    const sourceSettings = settings && typeof settings === "object" ? settings : {};
    const normalized = normalizeTimelineSettings(sourceSettings);
    const maxCycles = normalizeInteger(
        range.maxCycles,
        MAX_TIMELINE_CYCLES,
        MAX_TIMELINE_CYCLES,
        MAX_INTERNAL_TIMELINE_CYCLES,
    );
    const cycles = normalizeInteger(
        range.cycles ?? sourceSettings.loopCount,
        MIN_TIMELINE_CYCLES,
        MIN_TIMELINE_CYCLES,
        maxCycles,
    );
    const suppliedNotes = Array.isArray(range.resolvedNotes)
        ? range.resolvedNotes.filter((note) => typeof note === "string")
        : null;
    const suppliedSequence = suppliedNotes
        ? {
              notes: suppliedNotes,
              map: suppliedNotes.map((_, index) =>
                  normalizeInteger(
                      Array.isArray(range.sourceNoteMap) ? range.sourceNoteMap[index] : index,
                      index,
                      0,
                      Number.MAX_SAFE_INTEGER,
                  ),
              ),
          }
        : null;
    const cursor = suppliedSequence
        ? {
              stepsPerCycle: suppliedSequence.notes.length,
              nextCycle: () => ({
                  notes: [...suppliedSequence.notes],
                  map: [...suppliedSequence.map],
              }),
          }
        : createPatternSequenceCursor(normalized.baseNotes, {
              direction: normalized.direction,
              octaveRange: normalized.octaveRange,
              octaveShift: normalized.octaveShift,
              quantize: normalized.quantize,
              randomSeed: normalized.randomSeed,
              rng: typeof range.rng === "function" ? range.rng : undefined,
          });
    const stepDurationTicks = getIntervalTicks(normalized.interval);
    const stepsPerCycle = cursor.stepsPerCycle;
    const cycleDurationTicks = stepsPerCycle * stepDurationTicks;
    const musicalDurationTicks = cycleDurationTicks * cycles;
    const nominalDurationTicks = Math.max(1, Math.round(stepDurationTicks * normalized.gate));

    /** @type {TimelineEvent[]} */
    const rawEvents = [];
    let firstSequence = { notes: [], map: [] };
    for (let cycleIndex = 0; cycleIndex < cycles; cycleIndex += 1) {
        const sequence = cursor.nextCycle();
        if (cycleIndex === 0) firstSequence = sequence;
        for (let stepIndex = 0; stepIndex < stepsPerCycle; stepIndex += 1) {
            const sourceStepIndex = stepIndex;
            const rawStartTick = cycleIndex * cycleDurationTicks + stepIndex * stepDurationTicks;
            const occurrenceIndex = cycleIndex * stepsPerCycle + stepIndex;
            const unclippedStartTick = getTimelineStartTick(
                occurrenceIndex,
                stepDurationTicks,
                normalized.swing,
            );
            const isTerminalPreserved = range.terminalGatePolicy === "preserve";
            const startTick =
                !isTerminalPreserved && musicalDurationTicks > 0
                    ? Math.min(unclippedStartTick, musicalDurationTicks - 1)
                    : unclippedStartTick;
            const swingOffsetTicks = startTick - rawStartTick;
            rawEvents.push({
                pitch: sequence.notes[sourceStepIndex],
                startTick,
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
        const nextStartTick =
            rawEvents[index + 1]?.startTick ??
            (range.terminalGatePolicy === "preserve"
                ? event.startTick + event.nominalDurationTicks
                : musicalDurationTicks);
        const availableDurationTicks = Math.max(1, nextStartTick - event.startTick);
        return {
            ...event,
            durationTicks: Math.min(event.nominalDurationTicks, availableDurationTicks),
        };
    });

    return {
        events,
        resolvedNotes: [...firstSequence.notes],
        scheduledNotes: events.map((event) => event.pitch),
        sourceNoteMap: [...firstSequence.map],
        stepsPerCycle,
        stepDurationTicks,
        cycleDurationTicks,
        musicalDurationTicks,
        gateRatio: normalized.gate,
        bpm: normalized.bpm,
        swing: normalized.swing,
        cycles,
        randomSeed: normalized.randomSeed,
        interval: Object.hasOwn(INTERVAL_TICKS, normalized.interval)
            ? normalized.interval
            : DEFAULT_TIMELINE_INTERVAL,
    };
}

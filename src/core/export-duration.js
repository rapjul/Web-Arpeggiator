/**
 * Pure helpers for estimating the musical duration of an offline export.
 *
 * @module export-duration
 */

const SUPPORTED_NOTE_DENOMINATORS = new Set([2, 4, 8, 16, 32, 64]);
const DEFAULT_BPM = 120;
const DEFAULT_INTERVAL = "16n";
export const MIN_LOOP_COUNT = 1;
export const MAX_LOOP_COUNT = 100;

/**
 * Extra render time appended to offline exports so reverberation can decay.
 */
export const OFFLINE_RENDER_TAIL_SECONDS = 2;

/**
 * Converts the selected note subdivision into seconds at a given tempo.
 *
 * @param {unknown} interval - Tone-style note subdivision, such as "16n".
 * @param {unknown} bpm - Tempo in beats per minute.
 * @returns {number} Duration of one note step in seconds.
 */
export function getIntervalDurationSeconds(interval, bpm) {
    const parsedDenominator =
        typeof interval === "string" ? /^([0-9]+)n$/.exec(interval.trim()) : null;
    const denominator = Number(parsedDenominator?.[1]);
    const noteDenominator = SUPPORTED_NOTE_DENOMINATORS.has(denominator)
        ? denominator
        : Number(/^([0-9]+)n$/.exec(DEFAULT_INTERVAL)?.[1]);
    const parsedBpm = Number(bpm);
    const safeBpm = Number.isFinite(parsedBpm) && parsedBpm > 0 ? parsedBpm : DEFAULT_BPM;

    return 240 / (safeBpm * noteDenominator);
}

/**
 * Converts an arbitrary loop-count value to the supported export range.
 *
 * @param {unknown} loopCount - Requested number of complete pattern cycles.
 * @returns {number} Whole loop count between MIN_LOOP_COUNT and MAX_LOOP_COUNT.
 */
export function normalizeLoopCount(loopCount) {
    const parsedLoopCount = Number(loopCount);
    if (!Number.isFinite(parsedLoopCount)) return MIN_LOOP_COUNT;

    return Math.min(Math.max(Math.trunc(parsedLoopCount), MIN_LOOP_COUNT), MAX_LOOP_COUNT);
}

/**
 * Calculates the rendered duration shared by the offline exporter and its estimate.
 *
 * @param {object} options - Export duration inputs.
 * @param {unknown} options.loopCount - Number of complete pattern cycles to export.
 * @param {unknown} options.stepsPerLoop - Materialized note triggers in one pattern cycle.
 * @param {unknown} options.interval - Tone-style note subdivision, such as "16n".
 * @param {unknown} options.bpm - Tempo in beats per minute.
 * @returns {{loopCount: number, stepsPerLoop: number, intervalInSeconds: number, loopDuration: number, patternDuration: number, totalDuration: number}} Normalized timing values.
 */
export function calculateOfflineExportDuration({ loopCount, stepsPerLoop, interval, bpm }) {
    const safeLoopCount = normalizeLoopCount(loopCount);
    const parsedStepsPerLoop = Number(stepsPerLoop);
    const safeStepsPerLoop =
        Number.isFinite(parsedStepsPerLoop) && parsedStepsPerLoop >= 1
            ? Math.trunc(parsedStepsPerLoop)
            : 1;
    const intervalInSeconds = getIntervalDurationSeconds(interval, bpm);
    const loopDuration = safeStepsPerLoop * intervalInSeconds;
    const patternDuration = safeLoopCount * loopDuration;

    return {
        loopCount: safeLoopCount,
        stepsPerLoop: safeStepsPerLoop,
        intervalInSeconds,
        loopDuration,
        patternDuration,
        totalDuration: patternDuration + OFFLINE_RENDER_TAIL_SECONDS,
    };
}

/**
 * Produces the concise, human-readable estimate shown in the offline export card.
 *
 * @param {object} options - Export duration inputs.
 * @param {unknown} options.loopCount - Number of complete pattern cycles to export.
 * @param {unknown} options.stepsPerLoop - Materialized note triggers in one pattern cycle.
 * @param {unknown} options.interval - Tone-style note subdivision, such as "16n".
 * @param {unknown} options.bpm - Tempo in beats per minute.
 * @returns {string} Formatted duration estimate.
 */
export function formatEstimatedExportDuration({ loopCount, stepsPerLoop, interval, bpm }) {
    const {
        loopCount: safeLoopCount,
        loopDuration,
        totalDuration,
    } = calculateOfflineExportDuration({
        loopCount,
        stepsPerLoop,
        interval,
        bpm,
    });
    const loopLabel = safeLoopCount === MIN_LOOP_COUNT ? "loop" : "loops";
    const formattedLoopDuration =
        loopDuration < 0.1
            ? `~${Math.round(loopDuration * 1000)}ms`
            : `~${loopDuration.toFixed(2)}s`;

    return `${safeLoopCount} ${loopLabel} at ${formattedLoopDuration} each + ${OFFLINE_RENDER_TAIL_SECONDS}s reverb tail. Estimated export duration: ~${totalDuration.toFixed(1)} seconds`;
}

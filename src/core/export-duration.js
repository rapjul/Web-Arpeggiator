/**
 * Pure helpers for estimating the musical duration of an offline export.
 *
 * @module export-duration
 */

const SUPPORTED_NOTE_DENOMINATORS = new Set([2, 4, 8, 16, 32, 64]);
const DEFAULT_BPM = 120;
const DEFAULT_INTERVAL = "16n";

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
    const parsedLoopCount = Number(loopCount);
    const safeLoopCount =
        Number.isFinite(parsedLoopCount) && parsedLoopCount >= 1 ? Math.trunc(parsedLoopCount) : 1;
    const parsedStepsPerLoop = Number(stepsPerLoop);
    const safeStepsPerLoop =
        Number.isFinite(parsedStepsPerLoop) && parsedStepsPerLoop >= 1
            ? Math.trunc(parsedStepsPerLoop)
            : 1;
    const loopDuration = safeStepsPerLoop * getIntervalDurationSeconds(interval, bpm);
    const totalDuration = safeLoopCount * loopDuration;
    const loopLabel = safeLoopCount === 1 ? "loop" : "loops";
    const secondLabel = totalDuration === 1 ? "second" : "seconds";

    return `${safeLoopCount} ${loopLabel} × ~${loopDuration.toFixed(1)}s/loop = ~${totalDuration.toFixed(1)} ${secondLabel}`;
}

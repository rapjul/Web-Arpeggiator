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
export const OFFLINE_EXPORT_MODE_SEAMLESS = "seamless";
export const OFFLINE_EXPORT_MODE_TAIL = "tail";
export const DEFAULT_OFFLINE_EXPORT_MODE = OFFLINE_EXPORT_MODE_TAIL;
export const MIN_OFFLINE_EXPORT_TAIL_SECONDS = 0;
export const MAX_OFFLINE_EXPORT_TAIL_SECONDS = 10;
export const DEFAULT_OFFLINE_EXPORT_TAIL_SECONDS = 2;

/**
 * Backwards-compatible name for the previous fixed offline render tail.
 */
export const OFFLINE_RENDER_TAIL_SECONDS = DEFAULT_OFFLINE_EXPORT_TAIL_SECONDS;

/**
 * Shared fixed values used by the offline effects graph and seamless warm-up.
 */
export const OFFLINE_REVERB_DECAY_SECONDS = 1.5;
export const OFFLINE_DELAY_INTERVAL = "8n";
export const OFFLINE_DELAY_FEEDBACK = 0.5;
export const OFFLINE_EFFECT_SETTLE_AMPLITUDE = 0.001;

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
 * Normalizes a selectable offline export mode.
 *
 * @param {unknown} exportMode - Requested export mode.
 * @returns {"seamless"|"tail"} A supported export mode.
 */
export function normalizeOfflineExportMode(exportMode) {
    return exportMode === OFFLINE_EXPORT_MODE_SEAMLESS
        ? OFFLINE_EXPORT_MODE_SEAMLESS
        : OFFLINE_EXPORT_MODE_TAIL;
}

/**
 * Normalizes the appended effects-tail duration.
 *
 * @param {unknown} tailSeconds - Requested tail duration in seconds.
 * @returns {number} A one-decimal tail duration inside the supported range.
 */
export function normalizeOfflineExportTailSeconds(tailSeconds) {
    if (tailSeconds === null || tailSeconds === undefined || tailSeconds === "") {
        return DEFAULT_OFFLINE_EXPORT_TAIL_SECONDS;
    }

    const parsedTailSeconds = Number(tailSeconds);
    if (!Number.isFinite(parsedTailSeconds)) return DEFAULT_OFFLINE_EXPORT_TAIL_SECONDS;

    return (
        Math.round(
            Math.min(
                Math.max(parsedTailSeconds, MIN_OFFLINE_EXPORT_TAIL_SECONDS),
                MAX_OFFLINE_EXPORT_TAIL_SECONDS,
            ) * 10,
        ) / 10
    );
}

/**
 * Calculates how long repeated source material must run to settle the current
 * synth envelope and enabled feedback effects to approximately -60 dB.
 *
 * @param {object} options - Current export-effect settings.
 * @param {unknown} options.bpm - Tempo in beats per minute.
 * @param {unknown} options.envRelease - Synth release time in seconds.
 * @param {unknown} options.delayMix - Delay wet mix.
 * @param {unknown} options.reverbMix - Reverb wet mix.
 * @returns {number} Required warm-up time in seconds before cycle alignment.
 */
export function calculateEffectWarmupSeconds({ bpm, envRelease, delayMix, reverbMix }) {
    const parsedRelease = Number(envRelease);
    const releaseSeconds = Number.isFinite(parsedRelease) && parsedRelease > 0 ? parsedRelease : 0;
    const hasDelay = Number(delayMix) > 0;
    const hasReverb = Number(reverbMix) > 0;

    let warmupSeconds = releaseSeconds;

    if (hasDelay) {
        const repeatsToSettle = Math.ceil(
            Math.log(OFFLINE_EFFECT_SETTLE_AMPLITUDE) / Math.log(OFFLINE_DELAY_FEEDBACK),
        );
        warmupSeconds += getIntervalDurationSeconds(OFFLINE_DELAY_INTERVAL, bpm) * repeatsToSettle;
    }

    if (hasReverb) {
        warmupSeconds += OFFLINE_REVERB_DECAY_SECONDS;
    }

    return warmupSeconds;
}

/**
 * Calculates the rendered duration shared by the offline exporter and its estimate.
 *
 * @param {object} options - Export duration inputs.
 * @param {unknown} options.loopCount - Number of complete pattern cycles to export.
 * @param {unknown} options.stepsPerLoop - Materialized note triggers in one pattern cycle.
 * @param {unknown} options.interval - Tone-style note subdivision, such as "16n".
 * @param {unknown} options.bpm - Tempo in beats per minute.
 * @param {unknown} [options.exportMode] - Seamless loop or effects-tail export.
 * @param {unknown} [options.tailSeconds] - Effects tail duration in seconds.
 * @param {unknown} [options.envRelease] - Synth release time in seconds.
 * @param {unknown} [options.delayMix] - Delay wet mix.
 * @param {unknown} [options.reverbMix] - Reverb wet mix.
 * @returns {{loopCount: number, stepsPerLoop: number, intervalInSeconds: number, loopDuration: number, patternDuration: number, musicalDuration: number, preRollCycles: number, preRollDuration: number, tailDuration: number, exportDuration: number, renderDuration: number, totalDuration: number, exportMode: "seamless"|"tail"}} Normalized timing values.
 */
export function calculateOfflineExportDuration({
    loopCount,
    stepsPerLoop,
    interval,
    bpm,
    exportMode,
    tailSeconds,
    envRelease,
    delayMix,
    reverbMix,
}) {
    const safeLoopCount = normalizeLoopCount(loopCount);
    const parsedStepsPerLoop = Number(stepsPerLoop);
    const safeStepsPerLoop =
        Number.isFinite(parsedStepsPerLoop) && parsedStepsPerLoop >= 1
            ? Math.trunc(parsedStepsPerLoop)
            : 1;
    const intervalInSeconds = getIntervalDurationSeconds(interval, bpm);
    const loopDuration = safeStepsPerLoop * intervalInSeconds;
    const musicalDuration = safeLoopCount * loopDuration;
    const safeExportMode = normalizeOfflineExportMode(exportMode);
    const tailDuration =
        safeExportMode === OFFLINE_EXPORT_MODE_TAIL
            ? normalizeOfflineExportTailSeconds(tailSeconds)
            : 0;
    const effectWarmupSeconds =
        safeExportMode === OFFLINE_EXPORT_MODE_SEAMLESS
            ? calculateEffectWarmupSeconds({ bpm, envRelease, delayMix, reverbMix })
            : 0;
    const preRollCycles =
        effectWarmupSeconds > 0 ? Math.ceil(effectWarmupSeconds / loopDuration) : 0;
    const preRollDuration = preRollCycles * loopDuration;
    const exportDuration = musicalDuration + tailDuration;
    const renderDuration = preRollDuration + exportDuration;

    return {
        loopCount: safeLoopCount,
        stepsPerLoop: safeStepsPerLoop,
        intervalInSeconds,
        loopDuration,
        patternDuration: musicalDuration,
        musicalDuration,
        preRollCycles,
        preRollDuration,
        tailDuration,
        exportDuration,
        renderDuration,
        totalDuration: renderDuration,
        exportMode: safeExportMode,
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
 * @param {unknown} [options.exportMode] - Seamless loop or effects-tail export.
 * @param {unknown} [options.tailSeconds] - Effects tail duration in seconds.
 * @param {unknown} [options.envRelease] - Synth release time in seconds.
 * @param {unknown} [options.delayMix] - Delay wet mix.
 * @param {unknown} [options.reverbMix] - Reverb wet mix.
 * @returns {string} Formatted duration estimate.
 */
export function formatEstimatedExportDuration(options) {
    const {
        loopCount: safeLoopCount,
        loopDuration,
        exportDuration,
        preRollDuration,
        tailDuration,
        exportMode,
    } = calculateOfflineExportDuration(options);
    const loopLabel = safeLoopCount === MIN_LOOP_COUNT ? "Pattern cycle" : "Pattern cycles";
    const formattedLoopDuration =
        loopDuration < 0.1
            ? `~${Math.round(loopDuration * 1000)}ms`
            : `~${loopDuration.toFixed(2)}s`;

    if (exportMode === OFFLINE_EXPORT_MODE_SEAMLESS) {
        const warmupText =
            preRollDuration > 0
                ? ` Includes an internal ${preRollDuration.toFixed(1)}s effects warm-up.`
                : "";
        return `${safeLoopCount} ${loopLabel} at ${formattedLoopDuration} each. Seamless WAV duration: ~${exportDuration.toFixed(1)} seconds.${warmupText}`;
    }

    return `${safeLoopCount} ${loopLabel} at ${formattedLoopDuration} each + ${tailDuration.toFixed(1)}s effects tail. Export duration: ~${exportDuration.toFixed(1)} seconds`;
}

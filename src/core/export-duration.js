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
export const OFFLINE_AUTO_PAN_INTERVAL = "4n";
export const OFFLINE_AUTO_PAN_DEPTH = 1;
export const OFFLINE_CHORUS_FREQUENCY_HERTZ = 1.5;
export const OFFLINE_CHORUS_DELAY_MILLISECONDS = 3.5;
export const OFFLINE_CHORUS_DELAY_SECONDS = OFFLINE_CHORUS_DELAY_MILLISECONDS / 1000;
export const OFFLINE_CHORUS_DEPTH = 0.7;
export const OFFLINE_EFFECT_SETTLE_AMPLITUDE = 0.001;
export const SEAMLESS_RENDER_GUARD_FRAMES = 1;

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

function hasActiveEffectMix(mix) {
    const parsedMix = Number(mix);
    return Number.isFinite(parsedMix) && parsedMix > 0;
}

function isPhaseAligned(durationSeconds, periodSeconds) {
    const phaseCount = durationSeconds / periodSeconds;
    return Number.isFinite(phaseCount) && Math.abs(phaseCount - Math.round(phaseCount)) < 0.0000001;
}

/**
 * Checks whether active time-varying effects return to their starting phase
 * when a seamless export repeats.
 *
 * @param {object} options - Seamless export timing and effect settings.
 * @param {unknown} options.bpm - Tempo in beats per minute.
 * @param {unknown} options.musicalDuration - Exported musical duration in seconds.
 * @param {unknown} options.chorusMix - Chorus wet mix.
 * @param {unknown} options.autoPanMix - Auto-pan wet mix.
 * @returns {{isCompatible: boolean, incompatibleEffects: string[]}} Effects that prevent a seamless repeat.
 */
export function getSeamlessModulationCompatibility({
    bpm,
    musicalDuration,
    chorusMix,
    autoPanMix,
}) {
    const durationSeconds = Number(musicalDuration);
    const incompatibleEffects = [];

    if (
        hasActiveEffectMix(chorusMix) &&
        !isPhaseAligned(durationSeconds, 1 / OFFLINE_CHORUS_FREQUENCY_HERTZ)
    ) {
        incompatibleEffects.push("Chorus");
    }

    if (
        hasActiveEffectMix(autoPanMix) &&
        !isPhaseAligned(durationSeconds, getIntervalDurationSeconds(OFFLINE_AUTO_PAN_INTERVAL, bpm))
    ) {
        incompatibleEffects.push("Auto-pan");
    }

    return {
        isCompatible: incompatibleEffects.length === 0,
        incompatibleEffects,
    };
}

/**
 * Converts the seamless crop boundary into one integer-frame timeline and
 * reserves a guard frame so source rounding cannot create silent padding.
 *
 * @param {object} options - Seamless render timing.
 * @param {unknown} options.preRollDuration - Cycle-aligned warm-up duration in seconds.
 * @param {unknown} options.musicalDuration - Requested musical duration in seconds.
 * @param {unknown} options.sampleRate - Offline context sample rate.
 * @returns {{startFrame: number, frameCount: number, sourceFrameCount: number, offlineRenderFrameCount: number, offlineRenderDuration: number}} Exact crop and source-render window.
 */
export function calculateSeamlessRenderFrameWindow({
    preRollDuration,
    musicalDuration,
    sampleRate,
}) {
    const parsedSampleRate = Number(sampleRate);
    const safeSampleRate =
        Number.isFinite(parsedSampleRate) && parsedSampleRate > 0 ? parsedSampleRate : 44100;
    const safePreRollDuration = Math.max(0, Number(preRollDuration) || 0);
    const safeMusicalDuration = Math.max(0, Number(musicalDuration) || 0);
    const startFrame = Math.round(safePreRollDuration * safeSampleRate);
    const frameCount = Math.round(safeMusicalDuration * safeSampleRate);
    const sourceFrameCount = startFrame + frameCount;
    const offlineRenderFrameCount = sourceFrameCount + SEAMLESS_RENDER_GUARD_FRAMES;

    return {
        startFrame,
        frameCount,
        sourceFrameCount,
        offlineRenderFrameCount,
        offlineRenderDuration: offlineRenderFrameCount / safeSampleRate,
    };
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
 * @param {unknown} options.chorusMix - Chorus wet mix.
 * @param {unknown} options.autoPanMix - Auto-pan wet mix.
 * @returns {number} Required warm-up time in seconds before cycle alignment.
 */
export function calculateEffectWarmupSeconds({
    bpm,
    envRelease,
    delayMix,
    reverbMix,
    chorusMix,
    autoPanMix,
}) {
    const parsedRelease = Number(envRelease);
    const releaseSeconds = Number.isFinite(parsedRelease) && parsedRelease > 0 ? parsedRelease : 0;
    const hasDelay = hasActiveEffectMix(delayMix);
    const hasReverb = hasActiveEffectMix(reverbMix);
    const hasChorus = hasActiveEffectMix(chorusMix);
    const hasAutoPan = hasActiveEffectMix(autoPanMix);

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

    if (hasChorus) {
        warmupSeconds += OFFLINE_CHORUS_DELAY_SECONDS;
    }

    if (hasAutoPan) {
        warmupSeconds += getIntervalDurationSeconds(OFFLINE_AUTO_PAN_INTERVAL, bpm);
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
 * @param {unknown} [options.chorusMix] - Chorus wet mix.
 * @param {unknown} [options.autoPanMix] - Auto-pan wet mix.
 * @param {unknown} [options.terminalDuration] - Final selected release end in seconds.
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
    chorusMix,
    autoPanMix,
    terminalDuration,
}) {
    const safeLoopCount = normalizeLoopCount(loopCount);
    const parsedStepsPerLoop = Number(stepsPerLoop);
    const safeStepsPerLoop =
        Number.isFinite(parsedStepsPerLoop) && parsedStepsPerLoop >= 1
            ? Math.trunc(parsedStepsPerLoop)
            : 1;
    const intervalInSeconds = getIntervalDurationSeconds(interval, bpm);
    const loopDuration = safeStepsPerLoop * intervalInSeconds;
    const patternDuration = safeLoopCount * loopDuration;
    const safeExportMode = normalizeOfflineExportMode(exportMode);
    const parsedTerminalDuration = Number(terminalDuration);
    const musicalDuration =
        safeExportMode === OFFLINE_EXPORT_MODE_TAIL &&
        Number.isFinite(parsedTerminalDuration) &&
        parsedTerminalDuration > 0
            ? Math.max(patternDuration, parsedTerminalDuration)
            : patternDuration;
    const tailDuration =
        safeExportMode === OFFLINE_EXPORT_MODE_TAIL
            ? normalizeOfflineExportTailSeconds(tailSeconds)
            : 0;
    const effectWarmupSeconds =
        safeExportMode === OFFLINE_EXPORT_MODE_SEAMLESS
            ? calculateEffectWarmupSeconds({
                  bpm,
                  envRelease,
                  delayMix,
                  reverbMix,
                  chorusMix,
                  autoPanMix,
              })
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
        patternDuration,
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
 * @param {unknown} [options.chorusMix] - Chorus wet mix.
 * @param {unknown} [options.autoPanMix] - Auto-pan wet mix.
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
        musicalDuration,
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
        const { incompatibleEffects } = getSeamlessModulationCompatibility({
            bpm: options.bpm,
            musicalDuration,
            chorusMix: options.chorusMix,
            autoPanMix: options.autoPanMix,
        });
        const modulationText =
            incompatibleEffects.length > 0
                ? ` ${incompatibleEffects.join(" and ")} ${
                      incompatibleEffects.length === 1 ? "is" : "are"
                  } not phase-aligned across the selected Pattern cycles. Disable ${
                      incompatibleEffects.length === 1 ? "it" : "them"
                  }, adjust Pattern cycles, or use Include effects tail.`
                : "";
        return `${safeLoopCount} ${loopLabel} at ${formattedLoopDuration} each. Seamless WAV duration: ~${exportDuration.toFixed(1)} seconds.${warmupText}${modulationText}`;
    }

    return `${safeLoopCount} ${loopLabel} at ${formattedLoopDuration} each + ${tailDuration.toFixed(1)}s effects tail. Export duration: ~${exportDuration.toFixed(1)} seconds`;
}

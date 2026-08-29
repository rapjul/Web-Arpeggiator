/**
 * Audio metering and decibel mathematical transformations.
 *
 * @module core/meter-utils
 */

/**
 * Converts a decibel value to a clamped percentage ratio (0–100%).
 *
 * @param {number} db - Decibel value (e.g., -40 dB to 0 dB).
 * @param {number} [minDb=-40] - Minimum decibel bound representing 0%.
 * @param {number} [maxDb=0] - Maximum decibel bound representing 100%.
 * @returns {number} Integer percentage value between 0 and 100.
 */
export function dbToPercent(db, minDb = -40, maxDb = 0) {
    if (!Number.isFinite(db)) {
        return 0;
    }
    if (minDb >= maxDb) {
        return 0;
    }
    const clampedDb = Math.max(minDb, Math.min(maxDb, db));
    return Math.round(((clampedDb - minDb) / (maxDb - minDb)) * 100);
}

/**
 * Converts a 0–100 percentage value back into a corresponding decibel level.
 *
 * @param {number} percent - Percentage value (0 to 100).
 * @param {number} [minDb=-40] - Minimum decibel bound representing 0%.
 * @param {number} [maxDb=0] - Maximum decibel bound representing 100%.
 * @returns {number} Calculated decibel value clamped between minDb and maxDb.
 */
export function percentToDb(percent, minDb = -40, maxDb = 0) {
    if (!Number.isFinite(percent)) {
        return minDb;
    }
    const clampedPercent = Math.max(0, Math.min(100, percent));
    return minDb + (clampedPercent / 100) * (maxDb - minDb);
}

/**
 * Converts a linear peak audio sample amplitude (0.0 to 1.0+) to a decibel level.
 *
 * @param {number} linearAmplitude - Linear PCM audio amplitude value.
 * @returns {number} Corresponding decibel value or -Infinity for non-positive values.
 */
export function amplitudeToDb(linearAmplitude) {
    if (!Number.isFinite(linearAmplitude) || linearAmplitude <= 0) {
        return -Infinity;
    }
    return 20 * Math.log10(linearAmplitude);
}

/**
 * Calculates a smoothed exponential moving average level for VU meter displays.
 *
 * @param {number} currentLevel - Current smoothed level (0.0 to 1.0).
 * @param {number} targetLevel - Target peak level (0.0 to 1.0).
 * @param {number} [smoothing=0.8] - Smoothing factor between 0.0 (instant) and 1.0 (frozen).
 * @returns {number} Updated smoothed level value.
 */
export function smoothMeterLevel(currentLevel, targetLevel, smoothing = 0.8) {
    if (!Number.isFinite(currentLevel) || !Number.isFinite(targetLevel)) {
        return 0;
    }
    const factor = Math.max(0, Math.min(1, smoothing));
    return currentLevel * factor + targetLevel * (1 - factor);
}

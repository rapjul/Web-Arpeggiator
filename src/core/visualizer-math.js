/**
 * Mathematical algorithms and signal processing utilities for waveform visualizers.
 *
 * @module core/visualizer-math
 */

/**
 * Searches for a rising-edge zero-crossing trigger point in a waveform buffer
 * to stabilize oscilloscope display rendering.
 *
 * @param {Float32Array|number[]} buffer - PCM waveform audio sample buffer.
 * @param {number} [maxSearchRatio=0.5] - Fraction of buffer length to search for trigger.
 * @returns {number} Index of first detected rising zero crossing, or 0 if none found.
 */
export function findTriggerPoint(buffer, maxSearchRatio = 0.5) {
    if (!buffer || buffer.length < 2) {
        return 0;
    }
    const maxSearchIndex = Math.min(buffer.length - 1, Math.floor(buffer.length * maxSearchRatio));
    for (let i = 0; i < maxSearchIndex; i++) {
        if (buffer[i] < 0 && buffer[i + 1] >= 0) {
            return i;
        }
    }
    return 0;
}

/**
 * Copies incoming audio samples into a circular rolling buffer and returns the next write index.
 *
 * @param {Float32Array} rollingBuffer - Destination circular buffer.
 * @param {Float32Array|number[]} incomingSamples - New incoming PCM samples.
 * @param {number} writeIndex - Current insertion index in rollingBuffer.
 * @returns {number} Updated write index after inserting all samples.
 */
export function writeToCircularBuffer(rollingBuffer, incomingSamples, writeIndex) {
    if (!rollingBuffer || rollingBuffer.length === 0 || !incomingSamples) {
        return 0;
    }
    const capacity = rollingBuffer.length;
    let idx = writeIndex % capacity;
    for (let i = 0; i < incomingSamples.length; i++) {
        rollingBuffer[idx] = incomingSamples[i];
        idx = (idx + 1) % capacity;
    }
    return idx;
}

/**
 * Reconstructs a sequential chronological buffer from a circular buffer and its write head.
 *
 * @param {Float32Array} rollingBuffer - Circular buffer containing samples.
 * @param {number} writeIndex - Current write index representing the oldest sample position.
 * @returns {Float32Array} Reordered chronological buffer from oldest to newest sample.
 */
export function reconstructChronologicalBuffer(rollingBuffer, writeIndex) {
    if (!rollingBuffer || rollingBuffer.length === 0) {
        return new Float32Array(0);
    }
    const capacity = rollingBuffer.length;
    const buf = new Float32Array(capacity);
    const splitIndex = writeIndex % capacity;
    const part1 = rollingBuffer.subarray(splitIndex);
    const part2 = rollingBuffer.subarray(0, splitIndex);
    buf.set(part1, 0);
    buf.set(part2, part1.length);
    return buf;
}

/**
 * Calculates the maximum absolute peak sample value from an audio buffer.
 *
 * @param {Float32Array|number[]} samples - PCM audio samples.
 * @returns {number} Absolute peak amplitude value (0.0 or higher).
 */
export function calculatePeakAmplitude(samples) {
    if (!samples || samples.length === 0) {
        return 0;
    }
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const absVal = Math.abs(samples[i]);
        if (absVal > peak) {
            peak = absVal;
        }
    }
    return peak;
}

/**
 * Formats a frequency value in Hz to a concise display string with unit.
 *
 * @param {number} freq - Frequency value in Hertz.
 * @returns {string} Formatted frequency label (e.g. "100Hz", "1kHz", "10kHz").
 */
export function formatFrequencyLabel(freq) {
    if (!Number.isFinite(freq) || freq < 0) {
        return "0Hz";
    }
    if (freq >= 1000) {
        return `${Math.round(freq / 1000)}kHz`;
    }
    return `${Math.round(freq)}Hz`;
}

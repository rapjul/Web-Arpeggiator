/**
 * @file Unit tests for visualizer mathematical signal processing helpers.
 */

import { describe, expect, it } from "vitest";
import {
    calculatePeakAmplitude,
    findTriggerPoint,
    formatFrequencyLabel,
    reconstructChronologicalBuffer,
    writeToCircularBuffer,
} from "@core/visualizer-math.js";

describe("Visualizer Math Domain Module", () => {
    describe("findTriggerPoint", () => {
        it("finds the first rising-edge zero-crossing index", () => {
            const buffer = new Float32Array([-0.5, -0.2, 0.3, 0.8, -0.1, 0.2]);
            expect(findTriggerPoint(buffer)).toBe(1); // buffer[1] < 0 and buffer[2] >= 0
        });

        it("returns 0 if no rising zero crossing occurs within search window", () => {
            const buffer = new Float32Array([0.5, 0.4, 0.3, 0.2, 0.1, 0.0]);
            expect(findTriggerPoint(buffer)).toBe(0);
        });

        it("respects custom maxSearchRatio constraint", () => {
            // zero crossing at index 4
            const buffer = new Float32Array([-0.5, -0.4, -0.3, -0.2, -0.1, 0.5, 0.8, 0.9]);
            // Search only first 25% (2 elements): should not find crossing at index 4
            expect(findTriggerPoint(buffer, 0.25)).toBe(0);
            // Search 75%: should find crossing at index 4
            expect(findTriggerPoint(buffer, 0.75)).toBe(4);
        });

        it("returns 0 for empty, single-element, or null buffers", () => {
            expect(findTriggerPoint(new Float32Array(0))).toBe(0);
            expect(findTriggerPoint(new Float32Array([0.5]))).toBe(0);
            expect(findTriggerPoint(null as unknown as Float32Array)).toBe(0);
        });
    });

    describe("writeToCircularBuffer & reconstructChronologicalBuffer", () => {
        it("writes incoming samples into circular buffer and advances write head", () => {
            const circular = new Float32Array(5);
            const input1 = new Float32Array([1.0, 2.0, 3.0]);
            const nextIdx = writeToCircularBuffer(circular, input1, 0);

            expect(nextIdx).toBe(3);
            expect(Array.from(circular)).toEqual([1.0, 2.0, 3.0, 0.0, 0.0]);
        });

        it("wraps around circular buffer when capacity is exceeded", () => {
            const circular = new Float32Array(4);
            const input = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
            const nextIdx = writeToCircularBuffer(circular, input, 0);

            expect(nextIdx).toBe(2);
            expect(Array.from(circular)).toEqual([5.0, 6.0, 3.0, 4.0]);
        });

        it("reconstructs chronological sequence in correct oldest-to-newest order", () => {
            const circular = new Float32Array([5.0, 6.0, 3.0, 4.0]);
            // writeIndex is 2 (pointing to 3.0, the oldest element)
            const chrono = reconstructChronologicalBuffer(circular, 2);

            expect(Array.from(chrono)).toEqual([3.0, 4.0, 5.0, 6.0]);
        });

        it("handles empty or invalid circular buffers gracefully", () => {
            expect(writeToCircularBuffer(new Float32Array(0), [1], 0)).toBe(0);
            expect(reconstructChronologicalBuffer(new Float32Array(0), 0)).toEqual(
                new Float32Array(0),
            );
        });
    });

    describe("calculatePeakAmplitude", () => {
        it("finds the maximum absolute peak value", () => {
            const samples = new Float32Array([0.1, -0.85, 0.4, -0.2, 0.6]);
            expect(calculatePeakAmplitude(samples)).toBeCloseTo(0.85, 5);
        });

        it("returns 0 for empty or null samples", () => {
            expect(calculatePeakAmplitude(new Float32Array(0))).toBe(0);
            expect(calculatePeakAmplitude(null as unknown as Float32Array)).toBe(0);
        });
    });

    describe("formatFrequencyLabel", () => {
        it("formats Hz values below 1000", () => {
            expect(formatFrequencyLabel(100)).toBe("100Hz");
            expect(formatFrequencyLabel(500)).toBe("500Hz");
            expect(formatFrequencyLabel(999)).toBe("999Hz");
        });

        it("formats kHz values at or above 1000", () => {
            expect(formatFrequencyLabel(1000)).toBe("1kHz");
            expect(formatFrequencyLabel(5000)).toBe("5kHz");
            expect(formatFrequencyLabel(10000)).toBe("10kHz");
        });

        it("handles zero, negative, or invalid frequency values", () => {
            expect(formatFrequencyLabel(0)).toBe("0Hz");
            expect(formatFrequencyLabel(-100)).toBe("0Hz");
            expect(formatFrequencyLabel(NaN)).toBe("0Hz");
        });
    });
});

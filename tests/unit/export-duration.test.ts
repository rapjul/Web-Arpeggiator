/**
 * @file Unit tests for offline export duration estimates.
 */

import { describe, expect, it } from "vitest";
import {
    calculateOfflineExportDuration,
    formatEstimatedExportDuration,
    getIntervalDurationSeconds,
    MAX_LOOP_COUNT,
    MIN_LOOP_COUNT,
    normalizeLoopCount,
    OFFLINE_RENDER_TAIL_SECONDS,
} from "@core/export-duration.js";

describe("Export Duration", () => {
    it("calculates note subdivision duration from the selected BPM", () => {
        expect(getIntervalDurationSeconds("16n", 120)).toBe(0.125);
        expect(getIntervalDurationSeconds("8n", 120)).toBe(0.25);
        expect(getIntervalDurationSeconds("4n", 60)).toBe(1);
    });

    it("normalizes invalid loop counts to the supported whole-number range", () => {
        expect(normalizeLoopCount(-1)).toBe(MIN_LOOP_COUNT);
        expect(normalizeLoopCount(0)).toBe(MIN_LOOP_COUNT);
        expect(normalizeLoopCount("")).toBe(MIN_LOOP_COUNT);
        expect(normalizeLoopCount("not-a-number")).toBe(MIN_LOOP_COUNT);
        expect(normalizeLoopCount(Number.NaN)).toBe(MIN_LOOP_COUNT);
        expect(normalizeLoopCount(Number.NEGATIVE_INFINITY)).toBe(MIN_LOOP_COUNT);
        expect(normalizeLoopCount(Number.POSITIVE_INFINITY)).toBe(MIN_LOOP_COUNT);
        expect(normalizeLoopCount(null)).toBe(MIN_LOOP_COUNT);
        expect(normalizeLoopCount(undefined)).toBe(MIN_LOOP_COUNT);
        expect(normalizeLoopCount(3.9)).toBe(3);
        expect(normalizeLoopCount(101)).toBe(MAX_LOOP_COUNT);
    });

    it("shares the renderer duration calculation with the displayed estimate", () => {
        expect(
            calculateOfflineExportDuration({
                loopCount: 2,
                stepsPerLoop: 3,
                interval: "16n",
                bpm: 60,
            }),
        ).toEqual({
            loopCount: 2,
            stepsPerLoop: 3,
            intervalInSeconds: 0.25,
            loopDuration: 0.75,
            totalDuration: 3.5,
        });
    });

    it("includes the reverb tail in the export duration estimate", () => {
        expect(OFFLINE_RENDER_TAIL_SECONDS).toBe(2);
        expect(
            formatEstimatedExportDuration({
                loopCount: 3,
                stepsPerLoop: 4,
                interval: "8n",
                bpm: 120,
            }),
        ).toBe("3 loops at ~1.00s each + 2s reverb tail. Estimated export duration: ~5.00 seconds");
    });

    it("uses milliseconds for very short loops", () => {
        expect(
            formatEstimatedExportDuration({
                loopCount: 100,
                stepsPerLoop: 1,
                interval: "32n",
                bpm: 240,
            }),
        ).toBe(
            "100 loops at ~31ms each + 2s reverb tail. Estimated export duration: ~5.13 seconds",
        );
    });

    it("uses safe defaults for incomplete or invalid control values", () => {
        expect(getIntervalDurationSeconds("unsupported", Number.NaN)).toBe(0.125);
        expect(
            formatEstimatedExportDuration({
                loopCount: 0,
                stepsPerLoop: Number.NaN,
                interval: "bad",
                bpm: -1,
            }),
        ).toBe("1 loop at ~0.13s each + 2s reverb tail. Estimated export duration: ~2.13 seconds");
    });
});

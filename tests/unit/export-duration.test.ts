/**
 * @file Unit tests for offline export duration estimates.
 */

import { describe, expect, it } from "vitest";
import {
    formatEstimatedExportDuration,
    getIntervalDurationSeconds,
} from "@core/export-duration.js";

describe("Export Duration", () => {
    it("calculates note subdivision duration from the selected BPM", () => {
        expect(getIntervalDurationSeconds("16n", 120)).toBe(0.125);
        expect(getIntervalDurationSeconds("8n", 120)).toBe(0.25);
        expect(getIntervalDurationSeconds("4n", 60)).toBe(1);
    });

    it("formats a per-loop and total duration estimate", () => {
        expect(
            formatEstimatedExportDuration({
                loopCount: 3,
                stepsPerLoop: 4,
                interval: "8n",
                bpm: 120,
            }),
        ).toBe("3 loops × ~1.0s/loop = ~3.0 seconds");
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
        ).toBe("1 loop × ~0.1s/loop = ~0.1 seconds");
    });
});

/**
 * @file Unit tests for offline export duration estimates.
 */

import { describe, expect, it } from "vitest";
import {
    calculateSeamlessRenderFrameWindow,
    calculateOfflineExportDuration,
    DEFAULT_OFFLINE_EXPORT_MODE,
    DEFAULT_OFFLINE_EXPORT_TAIL_SECONDS,
    formatEstimatedExportDuration,
    getSeamlessModulationCompatibility,
    getIntervalDurationSeconds,
    MAX_LOOP_COUNT,
    MAX_OFFLINE_EXPORT_TAIL_SECONDS,
    MIN_LOOP_COUNT,
    MIN_OFFLINE_EXPORT_TAIL_SECONDS,
    normalizeOfflineExportMode,
    normalizeOfflineExportTailSeconds,
    OFFLINE_EXPORT_MODE_SEAMLESS,
    OFFLINE_EXPORT_MODE_TAIL,
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

    it("normalizes export modes and tail lengths with legacy-safe defaults", () => {
        expect(DEFAULT_OFFLINE_EXPORT_MODE).toBe(OFFLINE_EXPORT_MODE_TAIL);
        expect(normalizeOfflineExportMode(OFFLINE_EXPORT_MODE_SEAMLESS)).toBe(
            OFFLINE_EXPORT_MODE_SEAMLESS,
        );
        expect(normalizeOfflineExportMode("unexpected")).toBe(OFFLINE_EXPORT_MODE_TAIL);
        expect(normalizeOfflineExportTailSeconds(undefined)).toBe(
            DEFAULT_OFFLINE_EXPORT_TAIL_SECONDS,
        );
        expect(normalizeOfflineExportTailSeconds(null)).toBe(DEFAULT_OFFLINE_EXPORT_TAIL_SECONDS);
        expect(normalizeOfflineExportTailSeconds("bad")).toBe(DEFAULT_OFFLINE_EXPORT_TAIL_SECONDS);
        expect(normalizeOfflineExportTailSeconds(-2)).toBe(MIN_OFFLINE_EXPORT_TAIL_SECONDS);
        expect(normalizeOfflineExportTailSeconds(12)).toBe(MAX_OFFLINE_EXPORT_TAIL_SECONDS);
        expect(normalizeOfflineExportTailSeconds(1.24)).toBe(1.2);
    });

    it("retains a two-second tail when legacy settings omit export fields", () => {
        expect(OFFLINE_RENDER_TAIL_SECONDS).toBe(2);
        expect(
            calculateOfflineExportDuration({
                loopCount: 2,
                stepsPerLoop: 3,
                interval: "16n",
                bpm: 60,
            }),
        ).toMatchObject({
            exportMode: OFFLINE_EXPORT_MODE_TAIL,
            loopDuration: 0.75,
            musicalDuration: 1.5,
            tailDuration: 2,
            exportDuration: 3.5,
            preRollDuration: 0,
            renderDuration: 3.5,
        });
    });

    it("adds a configurable effects tail only to tail exports", () => {
        expect(
            calculateOfflineExportDuration({
                loopCount: 4,
                stepsPerLoop: 3,
                interval: "16n",
                bpm: 120,
                exportMode: OFFLINE_EXPORT_MODE_TAIL,
                tailSeconds: 2,
            }),
        ).toMatchObject({
            musicalDuration: 1.5,
            tailDuration: 2,
            exportDuration: 3.5,
            renderDuration: 3.5,
        });
    });

    it("warms seamless renders for envelope release and active effects", () => {
        expect(
            calculateOfflineExportDuration({
                loopCount: 4,
                stepsPerLoop: 3,
                interval: "16n",
                bpm: 120,
                exportMode: OFFLINE_EXPORT_MODE_SEAMLESS,
                envRelease: 1,
                delayMix: 0.5,
                reverbMix: 0.5,
            }),
        ).toMatchObject({
            musicalDuration: 1.5,
            preRollCycles: 14,
            preRollDuration: 5.25,
            tailDuration: 0,
            exportDuration: 1.5,
            renderDuration: 6.75,
        });
    });

    it("warms chorus and auto-pan before a seamless crop", () => {
        expect(
            calculateOfflineExportDuration({
                loopCount: 4,
                stepsPerLoop: 3,
                interval: "16n",
                bpm: 120,
                exportMode: OFFLINE_EXPORT_MODE_SEAMLESS,
                chorusMix: 0.5,
            }),
        ).toMatchObject({
            preRollCycles: 1,
            preRollDuration: 0.375,
        });
        expect(
            calculateOfflineExportDuration({
                loopCount: 4,
                stepsPerLoop: 3,
                interval: "16n",
                bpm: 120,
                exportMode: OFFLINE_EXPORT_MODE_SEAMLESS,
                autoPanMix: 0.5,
            }),
        ).toMatchObject({
            preRollCycles: 2,
            preRollDuration: 0.75,
        });
    });

    it("identifies time-varying effects that cannot repeat at the selected duration", () => {
        expect(
            getSeamlessModulationCompatibility({
                bpm: 120,
                musicalDuration: 1.5,
                chorusMix: 0.5,
                autoPanMix: 0.5,
            }),
        ).toEqual({
            isCompatible: false,
            incompatibleEffects: ["Chorus"],
        });
        expect(
            getSeamlessModulationCompatibility({
                bpm: 120,
                musicalDuration: 2,
                chorusMix: 0.5,
                autoPanMix: 0.5,
            }),
        ).toEqual({
            isCompatible: true,
            incompatibleEffects: [],
        });
    });

    it("uses a guarded integer-frame timeline for seamless source renders", () => {
        expect(
            calculateSeamlessRenderFrameWindow({
                preRollDuration: 0.0006,
                musicalDuration: 0.0006,
                sampleRate: 1000,
            }),
        ).toEqual({
            startFrame: 1,
            frameCount: 1,
            sourceFrameCount: 2,
            offlineRenderFrameCount: 3,
            offlineRenderDuration: 0.003,
        });
    });

    it("keeps dry seamless exports at their exact musical duration", () => {
        expect(getIntervalDurationSeconds("unsupported", Number.NaN)).toBe(0.125);
        expect(
            calculateOfflineExportDuration({
                loopCount: 1,
                stepsPerLoop: 3,
                interval: "16n",
                bpm: 120,
                exportMode: OFFLINE_EXPORT_MODE_SEAMLESS,
                envRelease: 0,
                delayMix: 0,
                reverbMix: 0,
            }),
        ).toMatchObject({
            musicalDuration: 0.375,
            preRollDuration: 0,
            exportDuration: 0.375,
            renderDuration: 0.375,
        });
    });

    it("describes seamless WAV and tail exports accurately", () => {
        expect(
            formatEstimatedExportDuration({
                loopCount: 3,
                stepsPerLoop: 4,
                interval: "8n",
                bpm: 120,
                exportMode: OFFLINE_EXPORT_MODE_TAIL,
                tailSeconds: 2,
            }),
        ).toBe(
            "3 Pattern cycles at ~1.00s each + 2.0s effects tail. Export duration: ~5.0 seconds",
        );
        expect(
            formatEstimatedExportDuration({
                loopCount: 1,
                stepsPerLoop: 1,
                interval: "16n",
                bpm: 120,
                exportMode: OFFLINE_EXPORT_MODE_SEAMLESS,
            }),
        ).toBe("1 Pattern cycle at ~0.13s each. Seamless WAV duration: ~0.1 seconds.");
        expect(
            formatEstimatedExportDuration({
                loopCount: 1,
                stepsPerLoop: 3,
                interval: "16n",
                bpm: 120,
                exportMode: OFFLINE_EXPORT_MODE_SEAMLESS,
                chorusMix: 0.5,
            }),
        ).toBe(
            "1 Pattern cycle at ~0.38s each. Seamless WAV duration: ~0.4 seconds. Includes an internal 0.4s effects warm-up. Chorus is not phase-aligned across the selected Pattern cycles. Disable it, adjust Pattern cycles, or use Include effects tail.",
        );
    });
});

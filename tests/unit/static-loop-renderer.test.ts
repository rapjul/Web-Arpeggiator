import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@core/settings-contract.js";
import { createStaticLoopRenderer } from "@audio/static-loop-renderer.js";

describe("static loop renderer", () => {
    it("renders one materialized cycle and publishes markers", async () => {
        const triggerAttackRelease = vi.fn();
        const start = vi.fn();
        const updateStaticLoopMap = vi.fn();
        const tone = {
            Time: vi.fn(() => ({ toSeconds: () => 0.25 })),
            Offline: vi.fn(async (callback) => {
                await callback({
                    transport: { bpm: { value: 120 }, swing: 0, start },
                });
                return { rendered: true };
            }),
        };
        const engine = {
            createOfflineChain: vi.fn(() => ({
                offlineSynth: { triggerAttackRelease },
            })),
        };
        const settings = { ...DEFAULT_SETTINGS, baseNotes: ["C4", "E4", "G4"] };
        const renderer = createStaticLoopRenderer({
            isAudioContextStarted: () => true,
            getTone: () => tone,
            getAudioEngine: () => engine,
            getSettings: () => settings,
            updateStaticLoopMap,
        });

        await renderer.render();

        expect(tone.Offline).toHaveBeenCalledOnce();
        expect(engine.createOfflineChain).toHaveBeenCalledOnce();
        expect(triggerAttackRelease).toHaveBeenCalled();
        expect(start).toHaveBeenCalledWith(0);
        expect(updateStaticLoopMap).toHaveBeenCalledOnce();
    });

    it("renders enough cycles to close a swung Loop Map boundary", async () => {
        const triggerAttackRelease = vi.fn();
        const tone = {
            Offline: vi.fn(async (callback, duration) => {
                await callback({
                    transport: { bpm: { value: 120 }, swing: 0, start: vi.fn() },
                });
                return { duration };
            }),
        };
        const updateStaticLoopMap = vi.fn();
        const renderer = createStaticLoopRenderer({
            isAudioContextStarted: () => true,
            getTone: () => tone,
            getAudioEngine: () => ({
                createOfflineChain: vi.fn(() => ({ offlineSynth: { triggerAttackRelease } })),
            }),
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                baseNotes: ["C4", "E4", "G4"],
                swing: 1,
            }),
            updateStaticLoopMap,
        });

        await renderer.render();

        expect(tone.Offline).toHaveBeenCalledWith(expect.any(Function), 1.5);
        expect(triggerAttackRelease).toHaveBeenCalledTimes(12);
        expect(updateStaticLoopMap).toHaveBeenCalledOnce();
        const [, markers] = updateStaticLoopMap.mock.calls[0];
        expect(markers).toHaveLength(12);
        expect(
            markers.every(
                (marker: { timeRatio: number }) => marker.timeRatio >= 0 && marker.timeRatio < 1,
            ),
        ).toBe(true);
        expect(markers[0].timeRatio).toBe(0);
        expect(markers.at(-1)?.timeRatio).toBeGreaterThan(0.75);
    });

    it("skips marker publication when the offline render fails", async () => {
        const updateStaticLoopMap = vi.fn();
        const logger = { error: vi.fn() };
        const error = new Error("render failed");
        const tone = {
            Time: vi.fn(() => ({ toSeconds: () => 0.25 })),
            Offline: vi.fn(async () => {
                throw error;
            }),
        };
        const renderer = createStaticLoopRenderer({
            isAudioContextStarted: () => true,
            getTone: () => tone,
            getAudioEngine: () => ({ createOfflineChain: vi.fn() }),
            getSettings: () => ({ ...DEFAULT_SETTINGS, baseNotes: ["C4", "E4", "G4"] }),
            updateStaticLoopMap,
            logger,
        });

        await renderer.render();

        expect(updateStaticLoopMap).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith("Static loop render failed:", error);
    });
});

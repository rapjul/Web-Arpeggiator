/**
 * @file Unit tests for workspace session manager and debouncing utilities.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionManager, debounce } from "@storage/session-manager.js";

describe("Session Manager Domain Module", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("debounce", () => {
        it("debounces rapid invocations until wait period expires", () => {
            const spy = vi.fn();
            const debounced = debounce(spy, 100);

            debounced("call 1");
            debounced("call 2");
            debounced("call 3");

            expect(spy).not.toHaveBeenCalled();

            vi.advanceTimersByTime(100);
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith("call 3");
        });
    });

    describe("createSessionManager", () => {
        it("saves session immediately via saveNow and reports test state", async () => {
            const savedSettings = { bpm: 140, notes: "C4 E4 G4" };
            const savedHistory = { past: [], present: savedSettings, future: [] };
            const updatedState: Record<string, unknown> = {};

            const mockPresetStore = {
                saveLastSession: vi.fn().mockResolvedValue({
                    id: "session-123",
                    savedAt: "2026-08-29T16:00:00Z",
                }),
            };

            const session = createSessionManager({
                getPresetStore: () => mockPresetStore,
                getSettings: () => savedSettings,
                getHistoryState: () => savedHistory,
                onRestore: vi.fn(),
                updateTestState: (updates) => Object.assign(updatedState, updates),
            });

            await session.saveNow();

            expect(mockPresetStore.saveLastSession).toHaveBeenCalledWith(
                savedSettings,
                savedHistory,
            );
            expect(updatedState.lastSessionId).toBe("session-123");
            expect(updatedState.lastSessionSavedAt).toBe("2026-08-29T16:00:00Z");
        });

        it("handles saveNow exceptions gracefully without throwing", async () => {
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            const mockPresetStore = {
                saveLastSession: vi.fn().mockRejectedValue(new Error("Disk error")),
            };

            const session = createSessionManager({
                getPresetStore: () => mockPresetStore,
                getSettings: () => ({ bpm: 120 }),
                onRestore: vi.fn(),
            });

            await expect(session.saveNow()).resolves.not.toThrow();
            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it("schedules debounced save and executes saveNow on timeout", async () => {
            const mockPresetStore = {
                saveLastSession: vi.fn().mockResolvedValue({ id: "s-1", savedAt: "now" }),
            };

            const session = createSessionManager({
                getPresetStore: () => mockPresetStore,
                getSettings: () => ({ bpm: 120 }),
                onRestore: vi.fn(),
                delayMs: 500,
            });

            session.scheduleSave();
            // Re-schedule to exercise replacing existing timer
            session.scheduleSave();

            expect(mockPresetStore.saveLastSession).not.toHaveBeenCalled();

            vi.advanceTimersByTime(500);
            expect(mockPresetStore.saveLastSession).toHaveBeenCalledTimes(1);
        });

        it("allows cancelling scheduled save before timeout", async () => {
            const mockPresetStore = {
                saveLastSession: vi.fn().mockResolvedValue({ id: "s-1", savedAt: "now" }),
            };

            const session = createSessionManager({
                getPresetStore: () => mockPresetStore,
                getSettings: () => ({ bpm: 120 }),
                onRestore: vi.fn(),
                delayMs: 500,
            });

            session.scheduleSave();
            vi.advanceTimersByTime(200);
            session.cancelScheduledSave();

            vi.advanceTimersByTime(400);
            expect(mockPresetStore.saveLastSession).not.toHaveBeenCalled();
        });

        it("restores last saved session from preset store and manages isRestoring state", async () => {
            const restoredPayload: Array<{ settings: Record<string, unknown>; history: unknown }> =
                [];
            const mockPresetStore = {
                loadLastSession: vi.fn().mockResolvedValue({
                    settings: { bpm: 135, patternDirection: "down" },
                    history: {
                        past: [],
                        present: { bpm: 135, patternDirection: "down" },
                        future: [],
                    },
                }),
            };

            const session = createSessionManager({
                getPresetStore: () => mockPresetStore,
                getSettings: () => ({}),
                onRestore: (settings, history) => restoredPayload.push({ settings, history }),
            });

            expect(session.getIsRestoring()).toBe(false);
            const success = await session.restoreSession();

            expect(success).toBe(true);
            expect(session.getIsRestoring()).toBe(false);
            expect(restoredPayload).toEqual([
                {
                    settings: { bpm: 135, patternDirection: "down" },
                    history: {
                        past: [],
                        present: { bpm: 135, patternDirection: "down" },
                        future: [],
                    },
                },
            ]);
        });

        it("handles loadLastSession returning empty/null settings", async () => {
            const mockPresetStore = {
                loadLastSession: vi.fn().mockResolvedValue(null),
            };

            const session = createSessionManager({
                getPresetStore: () => mockPresetStore,
                getSettings: () => ({}),
                onRestore: vi.fn(),
            });

            const success = await session.restoreSession();
            expect(success).toBe(false);
        });

        it("handles restoreSession exceptions gracefully", async () => {
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            const mockPresetStore = {
                loadLastSession: vi.fn().mockRejectedValue(new Error("Corrupt DB")),
            };

            const session = createSessionManager({
                getPresetStore: () => mockPresetStore,
                getSettings: () => ({}),
                onRestore: vi.fn(),
            });

            const success = await session.restoreSession();
            expect(success).toBe(false);
            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it("handles missing preset store or errors gracefully", async () => {
            const updatedState: Record<string, unknown> = {};
            const sessionNoStore = createSessionManager({
                getPresetStore: () => null,
                getSettings: () => ({}),
                onRestore: vi.fn(),
                updateTestState: (updates) => Object.assign(updatedState, updates),
            });

            await sessionNoStore.saveNow();
            const success = await sessionNoStore.restoreSession();
            expect(success).toBe(false);
            expect(updatedState.lastSessionRestoreFinished).toBe(true);
        });
    });
});

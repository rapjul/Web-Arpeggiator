import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    calculateStartupWaterfall,
    clearStartupProfiler,
    hasMark,
    isProfilingEnabled,
    isSearchParamEnabled,
    logStartupWaterfall,
    mark,
    measure,
    setProfilingOverride,
    STARTUP_MARKS,
    STARTUP_MEASURES,
} from "../../src/core/startup-profiler.js";

describe("core/startup-profiler", () => {
    beforeEach(() => {
        clearStartupProfiler();
    });

    afterEach(() => {
        clearStartupProfiler();
        vi.restoreAllMocks();
    });

    it("detects profiling as enabled in test environment", () => {
        expect(isProfilingEnabled()).toBe(true);
    });

    it("evaluates URL query strings for profiling activation flags", () => {
        expect(isSearchParamEnabled("?perf=true")).toBe(true);
        expect(isSearchParamEnabled("?debug=true")).toBe(true);
        expect(isSearchParamEnabled("?other=1&perf=true&mode=full")).toBe(true);
        expect(isSearchParamEnabled("")).toBe(false);
        expect(isSearchParamEnabled("?perf=false")).toBe(false);
        expect(isSearchParamEnabled("?notperf=true")).toBe(false);
        expect(isSearchParamEnabled("?debug=trueish")).toBe(false);
        expect(isSearchParamEnabled("?superf=true")).toBe(false);
        expect(isSearchParamEnabled(null as unknown as string)).toBe(false);
    });

    it("allows overriding profiling status for testing", () => {
        setProfilingOverride(false);
        expect(isProfilingEnabled()).toBe(false);

        setProfilingOverride(true);
        expect(isProfilingEnabled()).toBe(true);

        setProfilingOverride(null);
        expect(isProfilingEnabled()).toBe(true);
    });

    it("records performance marks safely when enabled", () => {
        expect(hasMark(STARTUP_MARKS.USER_START_GESTURE)).toBe(false);
        mark(STARTUP_MARKS.USER_START_GESTURE);
        expect(hasMark(STARTUP_MARKS.USER_START_GESTURE)).toBe(true);
    });

    it("returns false for non-existent marks", () => {
        expect(hasMark("non-existent-mark")).toBe(false);
    });

    it("safely ignores mark creation if performance.mark throws", () => {
        const originalMark = performance.mark;
        performance.mark = vi.fn().mockImplementation(() => {
            throw new Error("Mark error");
        });

        expect(() => mark("test-mark")).not.toThrow();
        performance.mark = originalMark;
    });

    it("safely handles hasMark when getEntriesByName throws", () => {
        const originalGetEntries = performance.getEntriesByName;
        performance.getEntriesByName = vi.fn().mockImplementation(() => {
            throw new Error("Query error");
        });

        expect(hasMark("test-mark")).toBe(false);
        performance.getEntriesByName = originalGetEntries;
    });

    it("measures interval between two existing marks", () => {
        mark(STARTUP_MARKS.MODULES_LOADING);
        mark(STARTUP_MARKS.MODULES_LOADED);

        const result = measure(
            STARTUP_MEASURES.MODULES_LOAD,
            STARTUP_MARKS.MODULES_LOADING,
            STARTUP_MARKS.MODULES_LOADED,
        );

        expect(result).not.toBeNull();
        expect(result?.name).toBe(STARTUP_MEASURES.MODULES_LOAD);
        expect(typeof result?.duration).toBe("number");
    });

    it("returns null when measuring between non-existent marks", () => {
        const result = measure("test-measure", "missing-start", "missing-end");
        expect(result).toBeNull();
    });

    it("returns null if performance.measure throws", () => {
        mark("mark-a");
        mark("mark-b");

        const originalMeasure = performance.measure;
        performance.measure = vi.fn().mockImplementation(() => {
            throw new Error("Measure failed");
        });

        const result = measure("failing-measure", "mark-a", "mark-b");
        expect(result).toBeNull();

        performance.measure = originalMeasure;
    });

    it("calculates startup waterfall steps when marks are present", () => {
        mark(STARTUP_MARKS.USER_START_GESTURE);
        mark(STARTUP_MARKS.MODULES_LOADING);
        mark(STARTUP_MARKS.MODULES_LOADED);
        mark(STARTUP_MARKS.CONTEXT_RESUMING);
        mark(STARTUP_MARKS.CONTEXT_RESUMED);
        mark(STARTUP_MARKS.ENGINE_CREATING);
        mark(STARTUP_MARKS.ENGINE_CREATED);
        mark(STARTUP_MARKS.SETTINGS_APPLYING);
        mark(STARTUP_MARKS.SETTINGS_APPLIED);
        mark(STARTUP_MARKS.TRANSPORT_STARTING);
        mark(STARTUP_MARKS.FIRST_STEP_EXECUTED);

        const steps = calculateStartupWaterfall();
        expect(steps.length).toBe(6);

        const measureNames = steps.map((s) => s.measureName);
        expect(measureNames).toContain(STARTUP_MEASURES.MODULES_LOAD);
        expect(measureNames).toContain(STARTUP_MEASURES.CONTEXT_RESUME);
        expect(measureNames).toContain(STARTUP_MEASURES.ENGINE_BUILD);
        expect(measureNames).toContain(STARTUP_MEASURES.SETTINGS_APPLY);
        expect(measureNames).toContain(STARTUP_MEASURES.TRANSPORT_TO_FIRST_NOTE);
        expect(measureNames).toContain(STARTUP_MEASURES.TOTAL_COLD_START);

        for (const step of steps) {
            expect(step).toHaveProperty("phase");
            expect(typeof step.durationMs).toBe("number");
            expect(typeof step.startTimeMs).toBe("number");
        }
    });

    it("returns empty waterfall when no marks are recorded", () => {
        const steps = calculateStartupWaterfall();
        expect(steps).toEqual([]);
    });

    it("logs waterfall report using logger.table when available", () => {
        mark(STARTUP_MARKS.USER_START_GESTURE);
        mark(STARTUP_MARKS.FIRST_STEP_EXECUTED);

        const mockLogger = {
            table: vi.fn(),
            log: vi.fn(),
        };

        const result = logStartupWaterfall(mockLogger);
        expect(result.length).toBeGreaterThan(0);
        expect(mockLogger.table).toHaveBeenCalledOnce();
        expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it("falls back to logger.log when logger.table is not available", () => {
        mark(STARTUP_MARKS.USER_START_GESTURE);
        mark(STARTUP_MARKS.FIRST_STEP_EXECUTED);

        const mockLogger = {
            log: vi.fn(),
        };

        const result = logStartupWaterfall(mockLogger);
        expect(result.length).toBeGreaterThan(0);
        expect(mockLogger.log).toHaveBeenCalledWith("Audio Startup Waterfall:", expect.any(Array));
    });

    it("returns empty array and skips logging if waterfall is empty", () => {
        const mockLogger = {
            table: vi.fn(),
            log: vi.fn(),
        };

        const result = logStartupWaterfall(mockLogger);
        expect(result).toEqual([]);
        expect(mockLogger.table).not.toHaveBeenCalled();
        expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it("clears all recorded marks and measures on clearStartupProfiler", () => {
        mark(STARTUP_MARKS.USER_START_GESTURE);
        mark(STARTUP_MARKS.FIRST_STEP_EXECUTED);
        measure(
            STARTUP_MEASURES.TOTAL_COLD_START,
            STARTUP_MARKS.USER_START_GESTURE,
            STARTUP_MARKS.FIRST_STEP_EXECUTED,
        );

        expect(hasMark(STARTUP_MARKS.USER_START_GESTURE)).toBe(true);

        clearStartupProfiler();

        expect(hasMark(STARTUP_MARKS.USER_START_GESTURE)).toBe(false);
    });

    it("disables mark, measure, and logging when profiling is disabled", () => {
        try {
            setProfilingOverride(false);

            expect(isProfilingEnabled()).toBe(false);
            mark("test-disabled-mark");
            expect(hasMark("test-disabled-mark")).toBe(false);
            expect(measure("m", "a", "b")).toBeNull();
            expect(calculateStartupWaterfall()).toEqual([]);
            expect(logStartupWaterfall()).toEqual([]);
        } finally {
            setProfilingOverride(null);
        }
    });
});

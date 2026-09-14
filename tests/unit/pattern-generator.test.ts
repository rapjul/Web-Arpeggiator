/** @file Unit tests for the injected Tone.Pattern scheduler. */

import { describe, expect, it, vi } from "vitest";

interface MockPatternInstance {
    values: string[];
    pattern: string;
    interval: string | number;
    index: number;
    isStarted: boolean;
    isDisposed: boolean;
    callback: (time: number, note: string) => void;
    start: () => void;
    dispose: () => void;
}

vi.mock("tone", async (importOriginal) => {
    const actual = await importOriginal<typeof import("tone")>();
    class MockPattern implements MockPatternInstance {
        values: string[];
        pattern: string;
        interval: string | number = "16n";
        index = 0;
        isStarted = false;
        isDisposed = false;
        callback: (time: number, note: string) => void;

        constructor(
            callback: (time: number, note: string) => void,
            values: string[],
            pattern: string,
        ) {
            this.callback = callback;
            this.values = values;
            this.pattern = pattern;
        }

        start() {
            this.isStarted = true;
        }

        dispose() {
            this.isDisposed = true;
        }
    }

    return {
        ...actual,
        Pattern: MockPattern,
        Draw: { schedule: (fn: () => void) => fn() },
        Time: (interval: string | number) => {
            if (interval === "invalid") {
                throw new Error("invalid interval");
            }
            return { toSeconds: () => 0.25 };
        },
    };
});

import { createPatternController } from "@audio/pattern-generator.js";

const baseSettings = () => ({
    baseNotes: ["C4", "E4", "G4"],
    octaveRange: 1,
    octaveShift: 0,
    interval: "16n",
    gate: 0.75,
    direction: "up",
    quantize: { enabled: false, root: "C", scale: "major" },
});

describe("Pattern controller", () => {
    it("creates an isolated Tone.Pattern from a settings snapshot", () => {
        const onPatternChange = vi.fn();
        const controller = createPatternController({
            getSynth: () => null,
            getIsPlaying: () => false,
            onPatternChange,
        });

        const pattern = controller.update(baseSettings()) as unknown as MockPatternInstance;

        expect(pattern.values).toEqual(["C4", "E4", "G4"]);
        expect(pattern.pattern).toBe("up");
        expect(pattern.interval).toBe("16n");
        expect(controller.getPattern()).toBe(pattern);
        expect(onPatternChange).toHaveBeenLastCalledWith(pattern);
    });

    it("uses a valid scheduling interval when duration conversion fails", () => {
        const synth = { triggerAttackRelease: vi.fn() };
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => false,
        });

        const pattern = controller.update({
            ...baseSettings(),
            interval: "invalid",
        }) as unknown as MockPatternInstance;

        expect(pattern.interval).toBe(0.1);
        pattern.callback(0.5, "C4");
        expect(synth.triggerAttackRelease).toHaveBeenCalledWith("C4", expect.closeTo(0.075), 0.5);
    });

    it("schedules synth attack/release and the mapped indicator callback through injections", () => {
        const synth = { triggerAttack: vi.fn(), triggerRelease: vi.fn() };
        const onStep = vi.fn();
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => true,
            onStep,
        });

        const pattern = controller.update({
            ...baseSettings(),
            direction: "down",
        }) as unknown as MockPatternInstance;
        expect(pattern.isStarted).toBe(true);

        pattern.index = 2;
        pattern.callback(0.25, "G4");
        expect(synth.triggerAttack).toHaveBeenCalledWith("G4", 0.25);
        expect(synth.triggerRelease).toHaveBeenCalledWith(0.4375);
        expect(onStep).toHaveBeenCalledWith(2);
    });

    it("uses triggerAttackRelease and falls back to immediate scheduling after a scheduling error", () => {
        const synth = {
            triggerAttack: vi.fn((_note: string, time?: number) => {
                if (time !== undefined) throw new Error("no scheduled time");
            }),
            triggerRelease: vi.fn(),
        };
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => false,
        });
        const pattern = controller.update(baseSettings()) as unknown as MockPatternInstance;

        pattern.callback(0.5, "C4");
        expect(synth.triggerAttack).toHaveBeenLastCalledWith("C4");
        expect(synth.triggerRelease).toHaveBeenLastCalledWith("+0.1875");

        const attackRelease = { triggerAttackRelease: vi.fn() };
        const alternate = createPatternController({
            getSynth: () => attackRelease,
            getIsPlaying: () => false,
        });
        const alternatePattern = alternate.update(baseSettings()) as unknown as MockPatternInstance;
        alternatePattern.callback(0.5, "C4");
        expect(attackRelease.triggerAttackRelease).toHaveBeenCalledWith("C4", 0.1875, 0.5);
    });

    it("replaces the previous pattern and disposes it when settings become empty", () => {
        const onPatternChange = vi.fn();
        const controller = createPatternController({
            getSynth: () => null,
            getIsPlaying: () => false,
            onPatternChange,
        });
        const first = controller.update(baseSettings()) as unknown as MockPatternInstance;
        const second = controller.update({
            ...baseSettings(),
            baseNotes: ["D4", "F4", "A4"],
        }) as unknown as MockPatternInstance;

        expect(first.isDisposed).toBe(true);
        expect(second.values).toEqual(["D4", "F4", "A4"]);
        expect(controller.update({ ...baseSettings(), baseNotes: [] })).toBeNull();
        expect(second.isDisposed).toBe(true);
        expect(onPatternChange).toHaveBeenLastCalledWith(null);
    });

    it("materializes each supported direction and applies octave expansion and quantization", () => {
        const controller = createPatternController({
            getSynth: () => null,
            getIsPlaying: () => false,
        });
        const directions = [
            "up",
            "down",
            "upDown",
            "downUp",
            "upDownRepeat",
            "downUpRepeat",
            "random",
            "octaveCycle",
            "octaveCycleReverse",
            "octaveCyclePingPong",
            "randomWalk",
            "randomWalkDrunk",
        ];

        for (const direction of directions) {
            const pattern = controller.update({
                ...baseSettings(),
                direction,
            }) as unknown as MockPatternInstance;
            expect(pattern.values.length).toBeGreaterThan(0);
        }

        const expanded = controller.update({
            ...baseSettings(),
            octaveRange: 2,
            octaveShift: 1,
            quantize: { enabled: true, root: "C", scale: "major" },
        }) as unknown as MockPatternInstance;
        expect(expanded.values).toContain("C5");
        expect(expanded.values).toContain("C6");
    });
});

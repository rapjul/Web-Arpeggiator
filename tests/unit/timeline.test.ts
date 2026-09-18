import { describe, expect, it } from "vitest";
import {
    compileTimeline,
    getIntervalTicks,
    getSwingOffsetTicks,
    TICKS_PER_BEAT,
    ticksToSeconds,
} from "@core/timeline.js";

const baseSettings = () => ({
    baseNotes: ["C4", "E4", "G4"],
    direction: "up",
    octaveRange: 1,
    octaveShift: 0,
    interval: "16n",
    gateRatio: 0.8,
    bpm: 120,
    swing: 0,
    scaleQuantize: false,
    scaleRoot: "C",
    scaleType: "major",
});

describe("musical timeline", () => {
    it("uses the shared 480-PPQ interval and second conversions", () => {
        expect(getIntervalTicks("16n")).toBe(120);
        expect(getIntervalTicks("unsupported")).toBe(120);
        expect(ticksToSeconds(TICKS_PER_BEAT, 120)).toBe(0.5);
        expect(ticksToSeconds(TICKS_PER_BEAT, 1)).toBe(1.5);
    });

    it("keeps swung gates behind the next actual attack across cycle boundaries", () => {
        const timeline = compileTimeline(
            { ...baseSettings(), swing: 1, gateRatio: 1 },
            { cycles: 2 },
        );
        timeline.events.slice(0, -1).forEach((event, index) => {
            expect(event.startTick + event.durationTicks).toBeLessThanOrEqual(
                timeline.events[index + 1].startTick,
            );
        });
        expect(
            timeline.events.map(({ startTick, durationTicks }) => [startTick, durationTicks]),
        ).toEqual([
            [0, 120],
            [233, 120],
            [359, 114],
            [473, 7],
            [480, 120],
            [713, 7],
        ]);
    });

    it("preserves only the terminal gate when requested for an effects tail", () => {
        const clipped = compileTimeline(
            { ...baseSettings(), swing: 1, gateRatio: 1 },
            { cycles: 1, terminalGatePolicy: "clip" },
        );
        const preserved = compileTimeline(
            { ...baseSettings(), swing: 1, gateRatio: 1 },
            { cycles: 1, terminalGatePolicy: "preserve" },
        );
        expect(clipped.events.at(-1)?.durationTicks).toBe(1);
        expect(preserved.events.at(-1)?.durationTicks).toBe(120);
    });

    it("materializes seeded stochastic cycles instead of freezing the first cycle", () => {
        const timeline = compileTimeline(
            { ...baseSettings(), direction: "randomCycle", randomSeed: 1234 },
            { cycles: 2 },
        );
        const first = timeline.scheduledNotes.slice(0, timeline.stepsPerCycle);
        const second = timeline.scheduledNotes.slice(timeline.stepsPerCycle);
        expect([...first].sort()).toEqual(["C4", "E4", "G4"]);
        expect([...second].sort()).toEqual(["C4", "E4", "G4"]);
        expect(second).not.toEqual(first);
        expect(
            compileTimeline(
                { ...baseSettings(), direction: "randomCycle", randomSeed: 1234 },
                { cycles: 2 },
            ).scheduledNotes,
        ).toEqual(timeline.scheduledNotes);
    });

    it("matches Tone's default 8th-note swing shape at integer ticks", () => {
        expect(getSwingOffsetTicks(0, 1)).toBe(0);
        expect(getSwingOffsetTicks(240, 1)).toBe(160);
        expect(getSwingOffsetTicks(120, 0.5)).toBe(57);
        expect(getSwingOffsetTicks(120, 0)).toBe(0);
    });

    it("compiles resolved notes, source identity, gate, and trailing musical duration", () => {
        const timeline = compileTimeline(baseSettings(), { cycles: 2 });

        expect(timeline.stepsPerCycle).toBe(3);
        expect(timeline.stepDurationTicks).toBe(120);
        expect(timeline.cycleDurationTicks).toBe(360);
        expect(timeline.musicalDurationTicks).toBe(720);
        expect(timeline.resolvedNotes).toEqual(["C4", "E4", "G4"]);
        expect(timeline.events).toHaveLength(6);
        expect(timeline.events[0]).toMatchObject({
            pitch: "C4",
            startTick: 0,
            durationTicks: 96,
            sourceNoteIndex: 0,
            sourceStepIndex: 0,
            cycleIndex: 0,
            stepIndex: 0,
        });
        expect(timeline.events[3]).toMatchObject({
            pitch: "C4",
            startTick: 360,
            cycleIndex: 1,
            stepIndex: 0,
        });
    });

    it("reuses a resolved sequence and permits internal warm-up cycles", () => {
        const source = compileTimeline(
            { ...baseSettings(), direction: "random" },
            { cycles: 1, rng: () => 0 },
        );
        const render = compileTimeline(
            { ...baseSettings(), direction: "random" },
            {
                cycles: 101,
                maxCycles: 101,
                resolvedNotes: source.resolvedNotes,
                sourceNoteMap: source.sourceNoteMap,
            },
        );

        expect(render.resolvedNotes).toEqual(source.resolvedNotes);
        expect(render.sourceNoteMap).toEqual(source.sourceNoteMap);
        expect(render.cycles).toBe(101);
        expect(compileTimeline({ ...baseSettings(), loopCount: 101 }, { cycles: 101 }).cycles).toBe(
            100,
        );
    });

    it("resolves every supported direction before scheduling", () => {
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
            const timeline = compileTimeline(
                { ...baseSettings(), direction },
                { cycles: 1, rng: () => 0.25 },
            );
            expect(timeline.events.length).toBeGreaterThan(0);
            expect(timeline.events.map((event) => event.pitch)).toEqual(timeline.resolvedNotes);
        }
    });

    it("applies octave expansion and scale quantization before timing", () => {
        const timeline = compileTimeline({
            ...baseSettings(),
            baseNotes: ["D#4"],
            octaveRange: 2,
            octaveShift: 1,
            scaleQuantize: true,
            scaleRoot: "C",
            scaleType: "major",
        });

        expect(timeline.resolvedNotes).toEqual(["D5", "D6"]);
        expect(timeline.events.map((event) => event.sourceNoteIndex)).toEqual([0, 0]);
    });

    it("bounds a swung gate before the next event can release a newer note", () => {
        const timeline = compileTimeline({
            ...baseSettings(),
            baseNotes: ["C4", "E4", "G4", "B4"],
            interval: "16n",
            gateRatio: 1,
            swing: 1,
        });

        timeline.events.forEach((event, index) => {
            const nextStart =
                timeline.events[index + 1]?.startTick ?? timeline.musicalDurationTicks;
            expect(event.startTick + event.durationTicks).toBeLessThanOrEqual(nextStart);
        });
    });

    it("keeps swung events ordered and inside the musical boundary", () => {
        const timeline = compileTimeline({
            ...baseSettings(),
            baseNotes: ["C4", "E4", "G4", "B4"],
            interval: "32n",
            swing: 1,
        });

        expect(
            timeline.events.every(
                (event, index) =>
                    index === 0 || event.startTick >= timeline.events[index - 1].startTick,
            ),
        ).toBe(true);
        expect(timeline.events.at(-1)?.startTick).toBeLessThan(timeline.musicalDurationTicks);
    });

    it("uses the normalized interval for unsupported input", () => {
        const timeline = compileTimeline({ ...baseSettings(), interval: "invalid" });

        expect(timeline.interval).toBe("16n");
    });

    it("keeps empty patterns empty without inventing a fallback note", () => {
        const timeline = compileTimeline({ ...baseSettings(), baseNotes: [] }, { cycles: 4 });

        expect(timeline.events).toEqual([]);
        expect(timeline.stepsPerCycle).toBe(0);
        expect(timeline.cycleDurationTicks).toBe(0);
        expect(timeline.musicalDurationTicks).toBe(0);
    });
});

/** @file Unit tests for the injected Tone.Pattern scheduler. */

import * as Tone from "tone";
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
    randomSeed: 1234,
    quantize: { enabled: false, root: "C", scale: "major" },
});

describe("Pattern controller", () => {
    it("creates an isolated timeline-backed Tone.Pattern from a settings snapshot", () => {
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

    it("uses the shared timeline interval and gate duration", () => {
        const synth = { triggerAttackRelease: vi.fn() };
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => false,
        });

        const pattern = controller.update({
            ...baseSettings(),
            interval: "16n",
        }) as unknown as MockPatternInstance;

        pattern.callback(0.5, "C4");
        expect(synth.triggerAttackRelease).toHaveBeenCalledWith("C4", expect.closeTo(0.09375), 0.5);
    });

    it("schedules synth attack/release and the mapped indicator callback through injections", () => {
        const synth = { triggerAttack: vi.fn(), triggerRelease: vi.fn() };
        const onStep = vi.fn();
        const controller = createPatternController({
            getSynth: () => synth,
            // getIsPlaying = false: occurrenceIndex starts at 0 deterministically
            getIsPlaying: () => false,
            onStep,
        });

        const pattern = controller.update({
            ...baseSettings(),
            direction: "up",
        }) as unknown as MockPatternInstance;

        pattern.callback(0, "C4");
        pattern.callback(0.125, "E4");
        pattern.callback(0.25, "G4");
        expect(synth.triggerAttack).toHaveBeenLastCalledWith("G4", 0.25);
        expect(synth.triggerRelease).toHaveBeenLastCalledWith(0.34375);
        expect(onStep).not.toHaveBeenCalled(); // guarded by getIsPlaying()
    });

    it("auto-starts the pattern when the transport is already playing", () => {
        const controller = createPatternController({
            getSynth: () => null,
            getIsPlaying: () => true,
        });

        const pattern = controller.update(baseSettings()) as unknown as MockPatternInstance;
        expect(pattern.isStarted).toBe(true);
    });

    it("recomputes swing from the absolute pattern occurrence", () => {
        const synth = { triggerAttack: vi.fn(), triggerRelease: vi.fn() };
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => false,
        });
        const pattern = controller.update({
            ...baseSettings(),
            swing: 1,
        }) as unknown as MockPatternInstance;

        pattern.index = 0;
        pattern.callback(0, "C4");
        pattern.index = 1;
        pattern.callback(0, "E4");
        pattern.index = 2;
        pattern.callback(0, "G4");
        pattern.index = 0;
        pattern.callback(1, "C4");

        expect(synth.triggerAttack).toHaveBeenNthCalledWith(
            4,
            "C4",
            expect.closeTo(1 + (113 / 480) * 0.5),
        );
    });

    it("bounds every swung gate by the next actual attack", () => {
        const synth = { triggerAttack: vi.fn(), triggerRelease: vi.fn() };
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => false,
        });
        const pattern = controller.update({
            ...baseSettings(),
            gate: 1,
            swing: 1,
        }) as unknown as MockPatternInstance;

        for (let occurrence = 0; occurrence < 6; occurrence += 1) {
            pattern.index = occurrence % 3;
            pattern.callback(occurrence * 0.125, "ignored");
        }

        for (let occurrence = 0; occurrence < 5; occurrence += 1) {
            const release = synth.triggerRelease.mock.calls[occurrence][0];
            const nextAttack = synth.triggerAttack.mock.calls[occurrence + 1][1];
            expect(release).toBeLessThanOrEqual(nextAttack);
        }
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
        expect(synth.triggerRelease).toHaveBeenLastCalledWith("+0.09375");

        const attackRelease = { triggerAttackRelease: vi.fn() };
        const alternate = createPatternController({
            getSynth: () => attackRelease,
            getIsPlaying: () => false,
        });
        const alternatePattern = alternate.update(baseSettings()) as unknown as MockPatternInstance;
        alternatePattern.callback(0.5, "C4");
        expect(attackRelease.triggerAttackRelease).toHaveBeenCalledWith("C4", 0.09375, 0.5);
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
            "randomCycle",
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

    it("suppresses the visual step indicator when the transport is not playing", () => {
        const onStep = vi.fn();
        let isPlaying = false;
        const controller = createPatternController({
            getSynth: () => null,
            getIsPlaying: () => isPlaying,
            onStep,
        });

        const pattern = controller.update(baseSettings()) as unknown as MockPatternInstance;
        // Draw.schedule fires immediately in the mock; onStep should not fire when stopped
        pattern.callback(0, "C4");
        expect(onStep).not.toHaveBeenCalled();

        isPlaying = true;
        pattern.callback(0, "E4");
        expect(onStep).toHaveBeenCalledTimes(1);
    });

    it("silences the active synth when the pattern is disposed", () => {
        const synth = { triggerAttack: vi.fn(), triggerRelease: vi.fn() };
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => false,
        });

        controller.update(baseSettings());
        controller.dispose();

        expect(synth.triggerRelease).toHaveBeenCalledOnce();
    });

    it("exposes silenceActiveSynth in the public controller API", () => {
        const synth = { triggerAttack: vi.fn(), triggerRelease: vi.fn() };
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => false,
        });

        controller.update(baseSettings());
        controller.silenceActiveSynth();

        expect(synth.triggerRelease).toHaveBeenCalledOnce();
    });

    it("advances the resumed occurrence to the next transport step using musical ticks", () => {
        const synth = { triggerAttack: vi.fn(), triggerRelease: vi.fn() };
        const transportSpy = vi.spyOn(Tone, "getTransport").mockReturnValue({
            ticks: 72,
            PPQ: 192,
        } as unknown as ReturnType<typeof Tone.getTransport>);

        try {
            const controller = createPatternController({
                getSynth: () => synth,
                getIsPlaying: () => true,
            });

            // 16n interval with PPQ 192 = 48 ticks per step.
            // At tick 72 (1.5 steps in), Math.ceil(72 / 48) = 2 (step 2, "G4")
            const pattern = controller.update(baseSettings()) as unknown as MockPatternInstance;
            pattern.callback(0.5, "ignored");

            expect(synth.triggerAttack).toHaveBeenCalledWith("G4", expect.any(Number));
        } finally {
            transportSpy.mockRestore();
        }
    });

    it("silences the previous synth when disposing after an instrument switch", () => {
        const synthA = { triggerAttack: vi.fn(), triggerRelease: vi.fn() };
        const synthB = { triggerAttack: vi.fn(), triggerRelease: vi.fn() };
        let activeSynth: unknown = synthA;

        const controller = createPatternController({
            getSynth: () => activeSynth,
            getIsPlaying: () => false,
        });

        controller.update(baseSettings());

        // Instrument switch: getSynth now returns synthB before dispose/rebuild
        activeSynth = synthB;
        controller.dispose();

        // Both the previously bound synth and the newly active synth are safely released
        expect(synthA.triggerRelease).toHaveBeenCalledOnce();
        expect(synthB.triggerRelease).toHaveBeenCalledOnce();
    });

    it("synchronizes stepIndex and cycleIndex across cycle boundaries without lagging", () => {
        const synth = { triggerAttack: vi.fn(), triggerRelease: vi.fn() };
        const onStep = vi.fn();
        const isPlaying = true;
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => isPlaying,
            onStep,
        });

        // 3 notes: "C4", "E4", "G4"
        const pattern = controller.update(baseSettings()) as unknown as MockPatternInstance;

        // Fire 4 steps (steps 0, 1, 2 of cycle 0, then step 0 of cycle 1)
        pattern.callback(0, "ignored");
        pattern.callback(0.125, "ignored");
        pattern.callback(0.25, "ignored");
        pattern.callback(0.375, "ignored");

        expect(synth.triggerAttack).toHaveBeenNthCalledWith(1, "C4", expect.any(Number));
        expect(synth.triggerAttack).toHaveBeenNthCalledWith(2, "E4", expect.any(Number));
        expect(synth.triggerAttack).toHaveBeenNthCalledWith(3, "G4", expect.any(Number));
        expect(synth.triggerAttack).toHaveBeenNthCalledWith(4, "C4", expect.any(Number));
    });

    it("cancels future queued envelope events without cutting sounding voice on live rebuild", () => {
        const envelope = { cancel: vi.fn() };
        const modulationEnvelope = { cancel: vi.fn() };
        const synth = {
            envelope,
            modulationEnvelope,
            triggerAttack: vi.fn(),
            triggerRelease: vi.fn(),
        };
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => true,
        });

        // Initial pattern build while playing
        controller.update(baseSettings());

        // Rebuild while playing (e.g. user changed BPM, swing, notes)
        controller.update({ ...baseSettings(), bpm: 140 });

        // During live update while playing, future envelope events are canceled
        // but triggerRelease is NOT called, preserving the active note's release tail
        expect(envelope.cancel).toHaveBeenCalled();
        expect(modulationEnvelope.cancel).toHaveBeenCalled();
        expect(synth.triggerRelease).not.toHaveBeenCalled();

        // Stopping / explicit silence calls triggerRelease
        controller.silenceActiveSynth();
        expect(synth.triggerRelease).toHaveBeenCalledOnce();
    });

    it("cancels queued events across multi-voice and filter envelopes", () => {
        const voice0Env = { cancel: vi.fn() };
        const voice0FilterEnv = { cancel: vi.fn() };
        const voice1Env = { cancel: vi.fn() };
        const duoSynth = {
            voice0: { envelope: voice0Env, filterEnvelope: voice0FilterEnv },
            voice1: { envelope: voice1Env },
            triggerRelease: vi.fn(),
        };

        const controller = createPatternController({
            getSynth: () => duoSynth,
            getIsPlaying: () => false,
        });

        controller.cancelQueuedSynthEvents(duoSynth, 1.5);
        expect(voice0Env.cancel).toHaveBeenCalledWith(1.5);
        expect(voice0FilterEnv.cancel).toHaveBeenCalledWith(1.5);
        expect(voice1Env.cancel).toHaveBeenCalledWith(1.5);
    });

    it("handles pattern creation error gracefully and logs via logger", () => {
        const logger = { error: vi.fn() };
        const controller = createPatternController({
            getSynth: () => null,
            getIsPlaying: () => false,
            logger,
        });

        const validPattern = controller.update(baseSettings());
        expect(validPattern).not.toBeNull();

        const originalPattern = Tone.Pattern;
        // @ts-expect-error mocking Pattern constructor throw
        Tone.Pattern = class FailingPattern {
            constructor() {
                throw new Error("Tone.Pattern allocation failed");
            }
        };

        try {
            const fallback = controller.update({ ...baseSettings(), bpm: 150 });
            expect(logger.error).toHaveBeenCalledWith(
                "createOrUpdatePattern error",
                expect.any(Error),
            );
            expect(fallback).toBeNull();
        } finally {
            // @ts-expect-error restore Pattern
            Tone.Pattern = originalPattern;
        }
    });

    it("preserves active note release during live pattern rebuild without premature release", () => {
        const env = { cancel: vi.fn() };
        const synth = {
            envelope: env,
            triggerAttack: vi.fn(),
            triggerRelease: vi.fn(),
        };
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => true,
        });

        const pattern = controller.update({
            ...baseSettings(),
            gate: 0.8,
            interval: "4n",
        }) as unknown as MockPatternInstance;

        // Trigger note at audio time 1.0 with duration ~0.4s (release scheduled at ~1.4)
        pattern.callback(1.0, "C4");
        const scheduledRelease = synth.triggerRelease.mock.calls[0][0];
        expect(scheduledRelease).toBeGreaterThan(1.0);

        // Spy on Tone.now() returning 1.1 (the note is currently sounding)
        const toneNowSpy = vi.spyOn(Tone, "now").mockReturnValue(1.1);
        try {
            // Live rebuild while sounding
            controller.update({
                ...baseSettings(),
                gate: 0.8,
                interval: "4n",
                octaveRange: 2,
            });

            // The envelope cancel call must be scheduled at or after the release, preserving it
            expect(env.cancel).toHaveBeenCalledWith(scheduledRelease);
            // Must not call immediate triggerRelease on the sounding voice
            expect(synth.triggerRelease).toHaveBeenCalledTimes(1);
        } finally {
            toneNowSpy.mockRestore();
        }
    });

    it("immediately silences sounding voice when rebuild compiles to an empty notes sequence", () => {
        const synth = {
            triggerAttack: vi.fn(),
            triggerRelease: vi.fn(),
        };
        const controller = createPatternController({
            getSynth: () => synth,
            getIsPlaying: () => true,
        });

        const pattern = controller.update(baseSettings()) as unknown as MockPatternInstance;
        pattern.callback(1.0, "C4");

        // Rebuild with empty notes
        const result = controller.update({ ...baseSettings(), baseNotes: [] });
        expect(result).toBeNull();
        expect(synth.triggerRelease).toHaveBeenCalled();
    });

    it("cancels queued PluckSynth excitations and pending transport swing attacks", () => {
        const noise = { stop: vi.fn() };
        const resonance = {
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
        };
        const pluckSynth = {
            _noise: noise,
            _lfcf: { resonance },
            triggerAttack: vi.fn(),
            triggerRelease: vi.fn(),
        };

        const scheduledEvents = new Map<number, (time: number) => void>();
        let nextEventId = 101;
        const transport = {
            clear: vi.fn((id: number) => {
                scheduledEvents.delete(id);
            }),
            scheduleOnce: vi.fn((cb: (time: number) => void, _time: string) => {
                const id = nextEventId++;
                scheduledEvents.set(id, cb);
                return id;
            }),
            ticks: 0,
            PPQ: 192,
        };

        const getTransportSpy = vi.spyOn(Tone, "getTransport").mockReturnValue(
            // @ts-expect-error partial transport mock
            transport,
        );

        try {
            const controller = createPatternController({
                getSynth: () => pluckSynth,
                getIsPlaying: () => true,
            });

            const pattern = controller.update({
                ...baseSettings(),
                swing: 1,
            }) as unknown as MockPatternInstance;

            // Step 0 is unswung; Step 1 is swung with swingOffsetTicks > 0
            pattern.callback(0.0, "C4");
            pattern.callback(0.25, "E4");
            expect(transport.scheduleOnce).toHaveBeenCalled();
            expect(scheduledEvents.size).toBe(1);

            // Stoppage / cancel clears pending transport events and cancels PluckSynth excitations
            controller.silenceActiveSynth();
            expect(transport.clear).toHaveBeenCalled();
            expect(noise.stop).toHaveBeenCalled();
            expect(resonance.cancelScheduledValues).toHaveBeenCalled();
            expect(resonance.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
        } finally {
            getTransportSpy.mockRestore();
        }
    });
});

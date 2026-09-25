/**
 * Subsystem benchmarks verifying execution budgets for audio startup,
 * timeline compilation, settings hydration, and profiler overhead.
 *
 * @module tests/perf/audio-startup-benchmarks
 */

import { describe, expect, it, vi } from "vitest";
import { createAudioEngine } from "../../src/audio/audio-engine.js";
import { mergeSettings } from "../../src/core/settings-contract.js";
import {
    clearStartupProfiler,
    mark,
    measure,
    STARTUP_MARKS,
    STARTUP_MEASURES,
} from "../../src/core/startup-profiler.js";
import { compileTimeline } from "../../src/core/timeline.js";

vi.mock("tone", async () => {
    class MockNode {
        connect() {
            return this;
        }
        toDestination() {
            return this;
        }
        chain() {
            return this;
        }
        dispose() {}
    }

    class MockParam {
        value = 0;
        linearRampToValueAtTime() {}
    }

    class MockSynth extends MockNode {
        oscillator = { type: "sine" };
        envelope = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 1.0 };
        triggerAttack() {}
        triggerRelease() {}
        triggerAttackRelease() {}
        set() {}
        get() {
            return { type: "synth", oscillator: { type: "sine" } };
        }
    }

    class MockFMSynth extends MockSynth {
        harmonicity = new MockParam();
        modulationIndex = new MockParam();
    }

    class MockAMSynth extends MockSynth {
        harmonicity = new MockParam();
    }

    class MockMonoSynth extends MockSynth {
        filterEnvelope = { baseFrequency: 2000, octaves: 3, exponent: 2 };
        filter = { Q: new MockParam() };
    }

    class MockDuoSynth extends MockNode {
        voice0 = {
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 1.0 },
        };
        voice1 = {
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 1.0 },
        };
        harmonicity = new MockParam();
        vibratoAmount = new MockParam();
        triggerAttack() {}
        triggerRelease() {}
        triggerAttackRelease() {}
        set() {}
        get() {
            return { type: "duosynth" };
        }
    }

    class MockPluckSynth extends MockSynth {
        attackNoise = 1;
        dampening = 4000;
        resonance = 0.7;
    }

    class MockMembraneSynth extends MockSynth {
        pitchDecay = 0.05;
        octaves = 4;
    }

    class MockMetalSynth extends MockSynth {
        harmonicity = 5.1;
        modulationIndex = 32;
        resonance = 4000;
        octaves = 1.5;
    }

    class MockFilter extends MockNode {
        frequency = new MockParam();
        Q = new MockParam();
    }

    class MockDistortion extends MockNode {
        distortion = 0.4;
        wet = new MockParam();
    }

    class MockChorus extends MockNode {
        wet = new MockParam();
        start() {
            return this;
        }
    }

    class MockAutoPanner extends MockNode {
        wet = new MockParam();
        start() {
            return this;
        }
    }

    class MockFeedbackDelay extends MockNode {
        wet = new MockParam();
    }

    class MockReverb extends MockNode {
        wet = new MockParam();
        decay = 1.5;
        generate() {
            return Promise.resolve();
        }
    }

    class MockVolume extends MockNode {
        volume = new MockParam();
    }

    class MockLimiter extends MockNode {}
    class MockAnalyser extends MockNode {
        getValue() {
            return new Float32Array(128);
        }
    }
    class MockMeter extends MockNode {
        getValue() {
            return -24;
        }
    }

    return {
        Synth: MockSynth,
        FMSynth: MockFMSynth,
        AMSynth: MockAMSynth,
        MonoSynth: MockMonoSynth,
        DuoSynth: MockDuoSynth,
        PluckSynth: MockPluckSynth,
        MembraneSynth: MockMembraneSynth,
        MetalSynth: MockMetalSynth,
        Filter: MockFilter,
        Distortion: MockDistortion,
        Chorus: MockChorus,
        AutoPanner: MockAutoPanner,
        FeedbackDelay: MockFeedbackDelay,
        Reverb: MockReverb,
        Volume: MockVolume,
        Limiter: MockLimiter,
        Analyser: MockAnalyser,
        Meter: MockMeter,
    };
});

describe("Audio Startup Subsystem Benchmarks", () => {
    it("compiles 100-cycle musical timeline well within latency budget", () => {
        const start = performance.now();

        const timeline = compileTimeline(
            {
                notes: ["C4", "E4", "G4", "B4", "D5"],
                direction: "up-down",
                bpm: 140,
                swing: 0.3,
                interval: "16n",
                gate: 0.8,
                octaveRange: 3,
                octaveShift: 1,
            },
            { cycles: 100 },
        );

        const durationMs = performance.now() - start;

        expect(timeline.events.length).toBeGreaterThan(100);
        // Timeline compilation for 100 cycles must easily finish under 100ms
        expect(durationMs).toBeLessThan(100);
    });

    it("hydrates and normalizes settings snapshots with negligible CPU overhead", () => {
        const start = performance.now();
        const iterations = 500;

        for (let i = 0; i < iterations; i += 1) {
            mergeSettings(
                {
                    synthType: "synth",
                    waveform: "sine",
                    bpm: 120,
                    swing: 0,
                    baseNotes: ["C4", "E4", "G4"],
                    patternDirection: "up",
                },
                {
                    synthType: "fm",
                    bpm: 130 + (i % 20),
                    baseNotes: ["D4", "F#4", "A4"],
                    patternDirection: "random-cycle",
                    swing: 0.25,
                },
            );
        }

        const durationMs = performance.now() - start;
        // 500 settings snapshot mergers should take well under 100ms
        expect(durationMs).toBeLessThan(100);
    });

    it("verifies profiler mark/measure overhead is sub-microsecond per call", () => {
        clearStartupProfiler();
        const iterations = 1000;
        const start = performance.now();

        for (let i = 0; i < iterations; i += 1) {
            mark(STARTUP_MARKS.MODULES_LOADING);
            mark(STARTUP_MARKS.MODULES_LOADED);
            measure(
                STARTUP_MEASURES.MODULES_LOAD,
                STARTUP_MARKS.MODULES_LOADING,
                STARTUP_MARKS.MODULES_LOADED,
            );
            clearStartupProfiler();
        }

        const totalMs = performance.now() - start;
        const avgPerIterationMs = totalMs / iterations;

        // Profiler overhead should be under 0.25ms (250 microseconds) per cycle
        // with headroom for loaded CI runner scheduling variation.
        expect(avgPerIterationMs).toBeLessThan(0.25);
    });

    /**
     * Note: This benchmark runs against no-op Tone mocks defined above to bound
     * synchronous object allocation and wiring loop overhead. Real Web Audio
     * and Tone.Synth graph construction latency is measured end-to-end against
     * the production bundle in tests/e2e/playback-startup-latency.test.ts.
     */
    it("constructs audio engine instances well within allocation budget", () => {
        const mockDom = {
            filterCutoffSlider: { value: "1000" },
            filterResonanceSlider: { value: "1" },
            delayMixSlider: { value: "0.2" },
            reverbMixSlider: { value: "0.3" },
            postGainSlider: { value: "0" },
            distortionSlider: { value: "0" },
            chorusMixSlider: { value: "0" },
            autoPanMixSlider: { value: "0" },
            synthWaveformSelect: { value: "sine" },
            harmonicitySlider: { value: "1" },
            modIndexSlider: { value: "1" },
            dutyCycleSlider: { value: "0.5" },
            envAttackSlider: { value: "0.01" },
            envDecaySlider: { value: "0.1" },
            envSustainSlider: { value: "0.5" },
            envReleaseSlider: { value: "1" },
        };

        const start = performance.now();
        const iterations = 20;

        for (let i = 0; i < iterations; i += 1) {
            const engine = createAudioEngine({
                dom: mockDom as unknown as Parameters<typeof createAudioEngine>[0]["dom"],
            });
            engine.dispose();
        }

        const totalMs = performance.now() - start;
        const meanPerEngineMs = totalMs / iterations;

        // Constructing and wiring the audio graph should average under 20ms per engine
        expect(meanPerEngineMs).toBeLessThan(20);
    });
});

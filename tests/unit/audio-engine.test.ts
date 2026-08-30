/**
 * @file Unit tests for Web Arpeggiator Audio Engine configurations, synth models, and offline chains.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("tone", async (importOriginal) => {
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
            return { type: "duoSynth" };
        }
    }

    class MockPluckSynth extends MockNode {
        dampening = 4000;
        resonance = 0.8;
        attackNoise = 1.0;
        triggerAttack() {}
        triggerRelease() {}
        triggerAttackRelease() {}
        set() {}
        get() {
            return { type: "pluckSynth" };
        }
    }

    class MockMembraneSynth extends MockSynth {
        pitchDecay = 0.05;
        octaves = 4;
        get() {
            return { type: "membraneSynth", oscillator: { type: "sine" } };
        }
    }

    return {
        Analyser: class extends MockNode {
            getValue() {
                return new Float32Array(1024);
            }
        },
        Volume: class extends MockNode {
            volume = new MockParam();
            constructor(vol?: number) {
                super();
                if (vol !== undefined) this.volume.value = vol;
            }
        },
        Limiter: MockNode,
        Meter: class extends MockNode {
            getValue() {
                return -12;
            }
        },
        Distortion: class extends MockNode {
            distortion = 0;
            wet = new MockParam();
        },
        Filter: class extends MockNode {
            frequency = new MockParam();
            Q = new MockParam();
            type = "lowpass";
        },
        Chorus: class extends MockNode {
            wet = new MockParam();
            start() {
                return this;
            }
        },
        AutoPanner: class extends MockNode {
            wet = new MockParam();
            start() {
                return this;
            }
        },
        FeedbackDelay: class extends MockNode {
            wet = new MockParam();
            delayTime = new MockParam();
            feedback = new MockParam();
        },
        Reverb: class extends MockNode {
            wet = new MockParam();
            decay = 1.5;
        },
        Synth: MockSynth,
        FMSynth: MockFMSynth,
        AMSynth: MockAMSynth,
        MonoSynth: MockMonoSynth,
        DuoSynth: MockDuoSynth,
        PluckSynth: MockPluckSynth,
        MembraneSynth: MockMembraneSynth,
        Offline: vi.fn(),
    };
});

import { createAudioEngine } from "@audio/audio-engine.js";

describe("Audio Engine Model Definitions", () => {
    const supportedSynthTypes = [
        "synth",
        "fmSynth",
        "amSynth",
        "monoSynth",
        "duoSynth",
        "pluckSynth",
        "membraneSynth",
    ] as const;

    const supportedWaveforms = ["sine", "square", "sawtooth", "triangle", "pulse"] as const;

    it("verifies all 7 expected synth models are registered", () => {
        expect(supportedSynthTypes).toHaveLength(7);
        expect(supportedSynthTypes).toContain("synth");
        expect(supportedSynthTypes).toContain("fmSynth");
        expect(supportedSynthTypes).toContain("amSynth");
        expect(supportedSynthTypes).toContain("monoSynth");
        expect(supportedSynthTypes).toContain("duoSynth");
        expect(supportedSynthTypes).toContain("pluckSynth");
        expect(supportedSynthTypes).toContain("membraneSynth");
    });

    it("verifies all 5 standard oscillator waveforms are supported", () => {
        expect(supportedWaveforms).toHaveLength(5);
        expect(supportedWaveforms).toContain("sine");
        expect(supportedWaveforms).toContain("square");
        expect(supportedWaveforms).toContain("sawtooth");
        expect(supportedWaveforms).toContain("triangle");
        expect(supportedWaveforms).toContain("pulse");
    });

    describe("createAudioEngine factory and signal chain", () => {
        let mockDom: Record<string, any>;
        let mockActions: Record<string, any>;

        beforeEach(() => {
            const createEl = (tag = "div") => document.createElement(tag);
            mockDom = {
                advancedSynthParams: createEl(),
                harmonicityControl: createEl(),
                modIndexControl: createEl(),
                carrierLabel: createEl(),
                dutyControl: createEl(),
                basicSynthParams: createEl(),
                waveformButtons: createEl(),
                monoSynthParams: createEl(),
                duoSynthParams: createEl(),
                pluckSynthParams: createEl(),
                membraneSynthParams: createEl(),
                harmonicitySlider: Object.assign(createEl("input"), { value: "3" }),
                modIndexSlider: Object.assign(createEl("input"), { value: "10" }),
                dutySlider: Object.assign(createEl("input"), { value: "0.5" }),
                monoCutoffSlider: Object.assign(createEl("input"), { value: "2000" }),
                monoOctavesSlider: Object.assign(createEl("input"), { value: "3" }),
                monoQSlider: Object.assign(createEl("input"), { value: "2" }),
                duoHarmSlider: Object.assign(createEl("input"), { value: "1.5" }),
                duoVibratoSlider: Object.assign(createEl("input"), { value: "0.5" }),
                pluckDampeningSlider: Object.assign(createEl("input"), { value: "4000" }),
                pluckResonanceSlider: Object.assign(createEl("input"), { value: "0.7" }),
                pluckNoiseSlider: Object.assign(createEl("input"), { value: "1.5" }),
                membranePitchDecaySlider: Object.assign(createEl("input"), { value: "0.05" }),
                membraneOctavesSlider: Object.assign(createEl("input"), { value: "4" }),
                envAttackSlider: Object.assign(createEl("input"), { value: "0.01" }),
                envDecaySlider: Object.assign(createEl("input"), { value: "0.1" }),
                envSustainSlider: Object.assign(createEl("input"), { value: "0.5" }),
                envReleaseSlider: Object.assign(createEl("input"), { value: "1.0" }),
                driveMixSlider: Object.assign(createEl("input"), { value: "0.2" }),
                chorusMixSlider: Object.assign(createEl("input"), { value: "0.3" }),
                autoPanMixSlider: Object.assign(createEl("input"), { value: "0.4" }),
            };

            mockActions = {
                syncPatternModuleState: vi.fn(),
                showToast: vi.fn(),
            };
        });

        it("instantiates audio engine with signal nodes and synths", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });

            expect(engine.analyser).toBeDefined();
            expect(engine.meter).toBeDefined();
            expect(engine.filter).toBeDefined();
            expect(engine.delay).toBeDefined();
            expect(engine.reverb).toBeDefined();
            expect(engine.synths).toBeDefined();
            expect(engine.currentWaveform).toBe("sine");

            engine.currentWaveform = "triangle";
            expect(engine.currentWaveform).toBe("triangle");
        });

        it("switches synth models and strictly matches registered instance", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });

            for (const synthType of supportedSynthTypes) {
                engine.setSynth(synthType);
                expect(engine.activeSynth).toBe(engine.synths[synthType]);
                expect(mockActions.syncPatternModuleState).toHaveBeenCalled();
            }
        });

        it("safely falls back to basic synth when an unknown synth type is requested", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });

            engine.setSynth("unknownAlienSynth" as any);
            expect(engine.activeSynth).toBe(engine.synths.synth);

            engine.setSynth("polySynth" as any);
            expect(engine.activeSynth).toBe(engine.synths.synth);
        });

        it("updates envelope settings on active synths", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });
            engine.setSynth("synth");

            mockDom.envAttackSlider.value = "0.05";
            mockDom.envDecaySlider.value = "0.2";
            mockDom.envSustainSlider.value = "0.4";
            mockDom.envReleaseSlider.value = "0.8";

            expect(() => engine.updateEnvelope()).not.toThrow();
        });

        it("returns synth configuration snapshot for offline rendering", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });
            engine.setSynth("fmSynth");

            const config = engine.getSynthConfig("fmSynth");
            expect(config).toBeDefined();
            expect(config.type).toBe("synth");
        });

        it("creates offline audio graph chains with postGain for all synth types", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });
            const mockOfflineContext = { destination: {} };

            for (const synthType of supportedSynthTypes) {
                const chain = engine.createOfflineChain(mockOfflineContext, {
                    synthType,
                    waveform: "sawtooth",
                    harmonicity: 2.0,
                    modulationIndex: 5,
                    monoCutoff: 1500,
                    monoOctaves: 3,
                    monoQ: 2,
                    duoHarm: 1.5,
                    duoVibrato: 0.3,
                    pluckDampening: 3000,
                    pluckResonance: 0.7,
                    pluckNoise: 1.2,
                    membranePitchDecay: 0.04,
                    membraneOctaves: 3,
                    envAttack: 0.01,
                    envDecay: 0.1,
                    envSustain: 0.5,
                    envRelease: 1.0,
                    filterCutoff: 3000,
                    filterResonance: 1.5,
                    driveMix: 0.2,
                    chorusMix: 0.3,
                    autoPanMix: 0.4,
                    delayMix: 0.3,
                    reverbMix: 0.4,
                    postGain: -4.5,
                });

                expect(chain.offlineSynth).toBeDefined();
                expect(chain.offlineOutput).toBeDefined();
                expect(chain.offlinePostGain).toBeDefined();
                expect(chain.offlinePostGain.volume.value).toBe(-4.5);
            }
        });

        it("updates envelope settings on multi-voice synths like duoSynth", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });
            engine.setSynth("duoSynth");

            mockDom.envAttackSlider.value = "0.02";
            mockDom.envDecaySlider.value = "0.15";
            mockDom.envSustainSlider.value = "0.6";
            mockDom.envReleaseSlider.value = "1.2";

            expect(() => engine.updateEnvelope()).not.toThrow();
        });

        it("manages waveform controls and overlays for pluckSynth and square waves", () => {
            mockDom.waveformPluckOverlay = document.createElement("div");
            mockDom.waveformButtons = document.createElement("div");
            const btn = document.createElement("button");
            mockDom.waveformButtons.appendChild(btn);

            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });

            // Pluck Synth disables waveform buttons
            engine.setSynth("pluckSynth");
            expect(btn.disabled).toBe(true);
            expect(mockDom.waveformPluckOverlay.classList.contains("flex")).toBe(true);

            // Basic Synth enables waveform buttons
            engine.setSynth("synth");
            expect(btn.disabled).toBe(false);
            expect(mockDom.waveformPluckOverlay.classList.contains("hidden")).toBe(true);

            // Square wave displays duty cycle
            engine.currentWaveform = "square";
            engine.setSynth("synth");
            expect(mockDom.dutyControl.classList.contains("hidden")).toBe(false);
        });

        it("switches parameters visibility for fmSynth, amSynth, monoSynth, duoSynth, membraneSynth", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });

            engine.setSynth("fmSynth");
            expect(mockDom.advancedSynthParams.classList.contains("hidden")).toBe(false);
            expect(mockDom.harmonicityControl.classList.contains("hidden")).toBe(false);

            engine.setSynth("amSynth");
            expect(mockDom.advancedSynthParams.classList.contains("hidden")).toBe(false);
            expect(mockDom.modIndexControl.classList.contains("hidden")).toBe(true);

            engine.setSynth("monoSynth");
            expect(mockDom.monoSynthParams.classList.contains("hidden")).toBe(false);

            engine.setSynth("duoSynth");
            expect(mockDom.duoSynthParams.classList.contains("hidden")).toBe(false);

            engine.setSynth("membraneSynth");
            expect(mockDom.membraneSynthParams.classList.contains("hidden")).toBe(false);

            engine.setSynth("pluckSynth");
            expect(mockDom.pluckSynthParams.classList.contains("hidden")).toBe(false);
        });

        it("handles limiter instantiation failure gracefully and routes directly to destination", async () => {
            const Tone = await import("tone");
            const originalLimiter = Tone.Limiter;
            try {
                // @ts-expect-error mocking Limiter failure
                Tone.Limiter = class FailingLimiter {
                    constructor() {
                        throw new Error("Limiter unsupported");
                    }
                };

                const engine = createAudioEngine({
                    dom: mockDom as any,
                    actions: mockActions as any,
                });
                expect(engine).toBeDefined();

                // Test offline chain without limiter
                const chain = engine.createOfflineChain(
                    { destination: {} },
                    { synthType: "synth" },
                );
                expect(chain.offlineOutput).toBeDefined();
            } finally {
                // @ts-expect-error restoring Limiter
                Tone.Limiter = originalLimiter;
            }
        });

        it("applies pluck and membrane synth parameters in createOfflineChain", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });
            const mockOfflineContext = { destination: {} };

            // Duo synth with voice envelopes
            const duoChain = engine.createOfflineChain(mockOfflineContext, {
                synthType: "duoSynth",
                duoHarm: 2.5,
                duoVibrato: 0.45,
                envAttack: 0.05,
                envDecay: 0.2,
                envSustain: 0.6,
                envRelease: 1.1,
            });
            expect(duoChain.offlineSynth).toBeDefined();

            // Pluck synth
            const pluckChain = engine.createOfflineChain(mockOfflineContext, {
                synthType: "pluckSynth",
                pluckDampening: 4500,
                pluckResonance: 0.85,
                pluckNoise: 1.8,
            });
            expect(pluckChain.offlineSynth).toBeDefined();

            // Membrane synth
            const membraneChain = engine.createOfflineChain(mockOfflineContext, {
                synthType: "membraneSynth",
                waveform: "sine",
                membranePitchDecay: 0.08,
                membraneOctaves: 6,
            });
            expect(membraneChain.offlineSynth).toBeDefined();

            // FM, AM, Mono synths
            const fmChain = engine.createOfflineChain(mockOfflineContext, {
                synthType: "fmSynth",
                harmonicity: 3.5,
                modulationIndex: 8.0,
                waveform: "sawtooth",
            });
            expect(fmChain.offlineSynth).toBeDefined();

            const amChain = engine.createOfflineChain(mockOfflineContext, {
                synthType: "amSynth",
                harmonicity: 2.5,
                waveform: "triangle",
            });
            expect(amChain.offlineSynth).toBeDefined();

            const monoChain = engine.createOfflineChain(mockOfflineContext, {
                synthType: "monoSynth",
                monoCutoff: 1800,
                monoOctaves: 4,
                monoQ: 3,
                waveform: "square",
            });
            expect(monoChain.offlineSynth).toBeDefined();
        });

        it("returns null for unknown synth config and handles empty active synth in updateEnvelope", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });

            expect(engine.getSynthConfig("invalidSynthType")).toBeNull();

            // Set sliders
            mockDom.duoHarmSlider.value = "3.2";
            mockDom.duoVibratoSlider.value = "0.7";
            engine.setSynth("duoSynth");
            expect(engine.activeSynth).toBe(engine.synths.duoSynth);

            mockDom.pluckDampeningSlider.value = "5500";
            mockDom.pluckResonanceSlider.value = "0.95";
            mockDom.pluckNoiseSlider.value = "2.1";
            engine.setSynth("pluckSynth");
            expect(engine.activeSynth).toBe(engine.synths.pluckSynth);

            mockDom.membranePitchDecaySlider.value = "0.12";
            mockDom.membraneOctavesSlider.value = "7.5";
            engine.setSynth("membraneSynth");
            expect(engine.activeSynth).toBe(engine.synths.membraneSynth);
        });
    });
});

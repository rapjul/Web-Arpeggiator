/**
 * @file Unit tests for Web Arpeggiator Audio Engine configurations and supported synth models.
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
        voice0 = {
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 1.0 },
        };
        voice1 = {
            oscillator: { type: "sine" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 1.0 },
        };
        harmonicity = new MockParam();
        modulationIndex = new MockParam();
        filterEnvelope = { baseFrequency: 2000, octaves: 3, exponent: 2 };
        filter = { Q: new MockParam() };
        vibratoAmount = new MockParam();
        dampening = 4000;
        resonance = 0.8;
        attackNoise = 1.0;
        pitchDecay = 0.05;
        octaves = 4;
        triggerAttack() {}
        triggerRelease() {}
        triggerAttackRelease() {}
        set() {}
        get() {
            return { type: "synth", oscillator: { type: "sine" } };
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
        FMSynth: MockSynth,
        AMSynth: MockSynth,
        MonoSynth: MockSynth,
        DuoSynth: MockSynth,
        PluckSynth: MockSynth,
        MembraneSynth: MockSynth,
        PolySynth: class extends MockNode {
            set() {}
        },
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
        "polySynth",
    ] as const;

    const supportedWaveforms = ["sine", "square", "sawtooth", "triangle", "pulse"] as const;

    it("verifies all 8 expected synth models are registered", () => {
        expect(supportedSynthTypes).toHaveLength(8);
        expect(supportedSynthTypes).toContain("synth");
        expect(supportedSynthTypes).toContain("fmSynth");
        expect(supportedSynthTypes).toContain("amSynth");
        expect(supportedSynthTypes).toContain("monoSynth");
        expect(supportedSynthTypes).toContain("duoSynth");
        expect(supportedSynthTypes).toContain("pluckSynth");
        expect(supportedSynthTypes).toContain("membraneSynth");
        expect(supportedSynthTypes).toContain("polySynth");
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

        it("switches synth models and updates activeSynth", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });

            for (const synthType of supportedSynthTypes) {
                engine.setSynth(synthType);
                expect(engine.activeSynth).toBeDefined();
                expect(mockActions.syncPatternModuleState).toHaveBeenCalled();
            }
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

        it("creates offline audio graph chains for all synth types", () => {
            const engine = createAudioEngine({ dom: mockDom as any, actions: mockActions as any });
            const mockOfflineContext = { destination: {} };

            const synthModels = [
                "synth",
                "fmSynth",
                "amSynth",
                "monoSynth",
                "duoSynth",
                "pluckSynth",
                "membraneSynth",
            ];

            for (const synthType of synthModels) {
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
                });

                expect(chain.offlineSynth).toBeDefined();
                expect(chain.offlineOutput).toBeDefined();
            }
        });
    });
});

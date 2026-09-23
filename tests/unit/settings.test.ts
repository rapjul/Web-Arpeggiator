/**
 * @file Unit tests for settings serialization, preset loading, and filename generation.
 */

import { createSettingsManager } from "@storage/settings-manager.js";
import { describe, expect, it, vi } from "vitest";

describe("Settings Manager Domain Module", () => {
    const createMockDom = () => {
        const createEl = (tag = "div") => document.createElement(tag);
        const seamlessExportMode = Object.assign(createEl("input"), {
            type: "radio",
            value: "seamless",
            checked: false,
        });
        const tailExportMode = Object.assign(createEl("input"), {
            type: "radio",
            value: "tail",
            checked: true,
        });
        return {
            bpmSlider: Object.assign(createEl("input"), { value: "135" }),
            swingSlider: Object.assign(createEl("input"), { value: "0.25" }),
            postGainSlider: Object.assign(createEl("input"), { value: "-6" }),
            intervalSelect: Object.assign(createEl("select"), {
                innerHTML:
                    "<option value='8n' selected>8n</option><option value='16n'>16n</option>",
                value: "8n",
            }),
            scaleQuantizeToggle: Object.assign(createEl("input"), { checked: true }),
            scaleRootSelect: Object.assign(createEl("select"), {
                innerHTML:
                    "<option value='D' selected>D</option><option value='C'>C</option><option value='F'>F</option>",
                value: "D",
            }),
            scaleTypeSelect: Object.assign(createEl("select"), {
                innerHTML:
                    "<option value='minor' selected>minor</option><option value='major'>major</option><option value='chromatic'>chromatic</option>",
                value: "minor",
            }),
            synthTypeSelect: Object.assign(createEl("select"), {
                innerHTML:
                    "<option value='synth' selected>synth</option><option value='fmSynth'>fmSynth</option><option value='amSynth'>amSynth</option><option value='monoSynth'>monoSynth</option><option value='duoSynth'>duoSynth</option><option value='pluckSynth'>pluckSynth</option><option value='membraneSynth'>membraneSynth</option>",
                value: "synth",
            }),
            harmonicitySlider: Object.assign(createEl("input"), { value: "2.5" }),
            modIndexSlider: Object.assign(createEl("input"), { value: "8.0" }),
            dutySlider: Object.assign(createEl("input"), { value: "0.4" }),
            gateSlider: Object.assign(createEl("input"), { value: "0.75" }),
            envAttackSlider: Object.assign(createEl("input"), { value: "0.05" }),
            envDecaySlider: Object.assign(createEl("input"), { value: "0.2" }),
            envSustainSlider: Object.assign(createEl("input"), { value: "0.4" }),
            envReleaseSlider: Object.assign(createEl("input"), { value: "0.8" }),
            filterCutoffSlider: Object.assign(createEl("input"), { value: "3500" }),
            filterResonanceSlider: Object.assign(createEl("input"), { value: "2.0" }),
            delayMixSlider: Object.assign(createEl("input"), { value: "0.3" }),
            reverbMixSlider: Object.assign(createEl("input"), { value: "0.4" }),
            loopCountInput: Object.assign(createEl("input"), { value: "4" }),
            offlineExportModeInputs: [seamlessExportMode, tailExportMode],
            offlineExportTailSecondsInput: Object.assign(createEl("input"), { value: "2" }),
            monoCutoffSlider: Object.assign(createEl("input"), { value: "2500" }),
            monoOctavesSlider: Object.assign(createEl("input"), { value: "3.5" }),
            monoQSlider: Object.assign(createEl("input"), { value: "2.5" }),
            duoHarmSlider: Object.assign(createEl("input"), { value: "1.8" }),
            duoVibratoSlider: Object.assign(createEl("input"), { value: "0.3" }),
            pluckDampeningSlider: Object.assign(createEl("input"), { value: "5000" }),
            pluckResonanceSlider: Object.assign(createEl("input"), { value: "0.8" }),
            pluckNoiseSlider: Object.assign(createEl("input"), { value: "1.2" }),
            membranePitchDecaySlider: Object.assign(createEl("input"), { value: "0.08" }),
            membraneOctavesSlider: Object.assign(createEl("input"), { value: "5.0" }),
            driveMixSlider: Object.assign(createEl("input"), { value: "0.15" }),
            chorusMixSlider: Object.assign(createEl("input"), { value: "0.25" }),
            autoPanMixSlider: Object.assign(createEl("input"), { value: "0.35" }),
            monoCutoffValue: createEl(),
            monoOctavesValue: createEl(),
            monoQValue: createEl(),
            duoHarmValue: createEl(),
            duoVibratoValue: createEl(),
            pluckDampeningValue: createEl(),
            pluckResonanceValue: createEl(),
            pluckNoiseValue: createEl(),
            membranePitchDecayValue: createEl(),
            membraneOctavesValue: createEl(),
            driveMixValue: createEl(),
            chorusMixValue: createEl(),
            autoPanMixValue: createEl(),
            bpmValue: createEl(),
            swingValue: createEl(),
            postGainValue: createEl(),
            notesInput: Object.assign(createEl("input"), { value: "D4 F4 A4" }),
            harmonicityValue: createEl(),
            modIndexValue: createEl(),
            dutyValue: createEl(),
            gateValue: createEl(),
            envAttackValue: createEl(),
            envDecayValue: createEl(),
            envSustainValue: createEl(),
            envReleaseValue: createEl(),
            filterCutoffValue: createEl(),
            filterResonanceValue: createEl(),
            delayMixValue: createEl(),
            reverbMixValue: createEl(),
            octaveShiftButtons: createEl(),
            octaveRangeButtons: createEl(),
        };
    };

    it("creates settings snapshot and formats filenames accurately", () => {
        const mockDom = createMockDom();
        const mockState = {
            currentNotes: ["D4", "F4", "A4"],
            currentOctaveShift: 1,
            currentOctaveRange: 2,
            currentWaveform: "sawtooth",
            activeSynth: null,
        };

        const mockActions = {
            getArpeggioNotes: (_notes: string[], _range: number, _shift: number) => [
                "D5",
                "D6",
                "F5",
                "F6",
                "A5",
                "A6",
            ],
            getSelectedPatternDirection: () => "upDown",
            setSelectedPatternDirection: () => {},
            updateScaleQuantizeUi: () => {},
            updateWaveformButtons: () => {},
            setSynth: () => {},
            updateButtonGroup: () => {},
            createOrUpdatePattern: () => {},
            showToast: () => {},
        };

        const mockAudio = {
            filter: { frequency: { value: 0 }, Q: { value: 0 } },
            delay: { wet: { value: 0 } },
            reverb: { wet: { value: 0 } },
            postGain: { volume: { value: 0 } },
        };

        const manager = createSettingsManager({
            state: mockState as unknown as Parameters<typeof createSettingsManager>[0]["state"],
            dom: mockDom as unknown as Parameters<typeof createSettingsManager>[0]["dom"],
            actions: mockActions as unknown as Parameters<
                typeof createSettingsManager
            >[0]["actions"],
            audio: mockAudio as unknown as Parameters<typeof createSettingsManager>[0]["audio"],
        });

        const settings = manager.getAllSettings();
        expect(settings.bpm).toBe(135);
        expect(settings.swing).toBe(0.25);
        expect(settings.postGain).toBe(-6);
        expect(settings.baseNotes).toEqual(["D4", "F4", "A4"]);
        expect(settings.notes).toEqual(["D5", "D6", "F5", "F6", "A5", "A6"]);
        expect(settings.direction).toBe("upDown");
        expect(settings.scaleQuantize).toBe(true);
        expect(settings.scaleRoot).toBe("D");
        expect(settings.scaleType).toBe("minor");
        expect(settings.waveform).toBe("sawtooth");
        expect(settings.loopCount).toBe(4);
        expect(settings.offlineExportMode).toBe("tail");
        expect(settings.offlineExportTailSeconds).toBe(2);
        expect(settings.monoCutoff).toBe(2500);
        expect(settings.driveMix).toBe(0.15);

        const filename = manager.generateFilename(false);
        expect(filename).toContain("arp-135bpm-basicSynth-synth-sawtooth-8n-DFA-D-minor");

        const audioFilename = manager.generateFilename(false, settings, "audio");
        expect(audioFilename).toContain(
            "arp-135bpm-D4-F4-A4-upDown-8n-4x-tail-2s-synth-sawtooth-D-minor",
        );

        const seamlessFilename = manager.generateFilename(
            false,
            { ...settings, offlineExportMode: "seamless" },
            "audio",
        );
        expect(seamlessFilename).toContain("4x-seamless-loop-synth-sawtooth");

        const realtimeFilename = manager.generateFilename(true);
        expect(realtimeFilename).toContain("arp-realtime-");
    });

    it("generates filename for non-synth types and unquantized chromatic mode", () => {
        const mockDom = createMockDom();
        mockDom.synthTypeSelect.value = "fmSynth";
        mockDom.scaleQuantizeToggle.checked = false;

        const mockState = {
            currentNotes: ["C4", "E4", "G4"],
            currentOctaveShift: 0,
            currentOctaveRange: 1,
            currentWaveform: "square",
            activeSynth: null,
        };

        const mockActions = {
            getArpeggioNotes: () => ["C4", "E4", "G4"],
            getSelectedPatternDirection: () => "down",
            setSelectedPatternDirection: () => {},
            updateScaleQuantizeUi: () => {},
            updateWaveformButtons: () => {},
            setSynth: () => {},
            updateButtonGroup: () => {},
            createOrUpdatePattern: () => {},
            showToast: () => {},
        };

        const mockAudio = {
            filter: { frequency: { value: 0 }, Q: { value: 0 } },
            delay: { wet: { value: 0 } },
            reverb: { wet: { value: 0 } },
            postGain: { volume: { value: 0 } },
        } as unknown as Parameters<typeof createSettingsManager>[0]["audio"];

        const manager = createSettingsManager({
            state: mockState as unknown as Parameters<typeof createSettingsManager>[0]["state"],
            dom: mockDom as unknown as Parameters<typeof createSettingsManager>[0]["dom"],
            actions: mockActions as unknown as Parameters<
                typeof createSettingsManager
            >[0]["actions"],
            audio: mockAudio,
        });

        const filename = manager.generateFilename(false);
        expect(filename).toContain("arp-135bpm-down-fmSynth-8n-CEG-noScale");
    });

    it("loads all synthesis, effects, and extended slider parameters cleanly", () => {
        const mockDom = createMockDom();
        const mockState = {
            currentNotes: ["C4"],
            currentOctaveShift: 0,
            currentOctaveRange: 1,
            currentWaveform: "sine",
            activeSynth: { oscillator: { type: "sine" } },
        };

        const mockActions = {
            getArpeggioNotes: () => ["C4"],
            getSelectedPatternDirection: () => "up",
            setSelectedPatternDirection: vi.fn(),
            updateScaleQuantizeUi: vi.fn(),
            updateScaleQuantizeToggleText: vi.fn(),
            updateWaveformButtons: vi.fn(),
            setSynth: vi.fn(),
            updateEnvelope: vi.fn(),
            updateButtonGroup: vi.fn(),
            createOrUpdatePattern: vi.fn(),
            updateEstimatedExportDuration: vi.fn(),
            updateOfflineExportModeUi: vi.fn(),
            showToast: vi.fn(),
        };

        const mockAudio = {
            filter: { frequency: { value: 0 }, Q: { value: 0 } },
            delay: { wet: { value: 0 } },
            reverb: { wet: { value: 0 } },
            postGain: { volume: { value: 0 } },
            distortion: { wet: { value: 0 } },
            chorus: { wet: { value: 0 } },
            autoPanner: { wet: { value: 0 } },
        } as unknown as Parameters<typeof createSettingsManager>[0]["audio"];

        const manager = createSettingsManager({
            state: mockState as unknown as Parameters<typeof createSettingsManager>[0]["state"],
            dom: mockDom as unknown as Parameters<typeof createSettingsManager>[0]["dom"],
            actions: mockActions as unknown as Parameters<
                typeof createSettingsManager
            >[0]["actions"],
            audio: mockAudio,
        });

        manager.loadAllSettings({
            bpm: 140,
            swing: 0.2,
            postGain: -4,
            baseNotes: ["C4", "E4", "G4"],
            direction: "upDown",
            interval: "8n",
            scaleQuantize: true,
            scaleRoot: "F",
            scaleType: "minor",
            synthType: "monoSynth",
            waveform: "sawtooth",
            harmonicity: 3.5,
            modulationIndex: 7.0,
            dutyCycle: 0.45,
            gateLength: 0.7,
            monoCutoff: 1800,
            monoOctaves: 4.5,
            monoQ: 3.0,
            duoHarm: 2.2,
            duoVibrato: 0.4,
            pluckDampening: 3500,
            pluckResonance: 0.75,
            pluckNoise: 1.4,
            membranePitchDecay: 0.06,
            membraneOctaves: 6.0,
            envAttack: 0.02,
            envDecay: 0.15,
            envSustain: 0.6,
            envRelease: 1.2,
            filterCutoff: 3200,
            filterResonance: 2.5,
            driveMix: 0.3,
            chorusMix: 0.4,
            autoPanMix: 0.5,
            delayMix: 0.35,
            reverbMix: 0.45,
            octaveShift: 1,
            octaveRange: 3,
            loopCount: 4,
        });

        expect(mockDom.bpmSlider.value).toBe("140");
        expect(mockDom.scaleRootSelect.value).toBe("F");
        expect(mockDom.scaleTypeSelect.value).toBe("minor");
        expect(mockDom.monoCutoffSlider.value).toBe("1800");
        expect(mockDom.driveMixSlider.value).toBe("0.3");
        expect(mockAudio.filter.frequency.value).toBe(3200);
        expect(mockAudio.delay.wet.value).toBe(0.35);
        expect(mockAudio.reverb.wet.value).toBe(0.45);
        expect(mockActions.setSelectedPatternDirection).toHaveBeenCalledWith("upDown");
        expect(mockActions.updateScaleQuantizeUi).toHaveBeenCalled();
        expect(mockActions.setSynth).toHaveBeenCalledWith("monoSynth");
        expect(mockActions.updateEnvelope).toHaveBeenCalled();
        expect(mockActions.updateEstimatedExportDuration).toHaveBeenCalled();
        expect(mockDom.offlineExportModeInputs[1].checked).toBe(true);
        expect(mockDom.offlineExportTailSecondsInput.value).toBe("2");

        manager.loadAllSettings({
            ...manager.getAllSettings(),
            offlineExportMode: "seamless",
            offlineExportTailSeconds: 3.5,
        });
        expect(mockDom.offlineExportModeInputs[0].checked).toBe(true);
        expect(mockDom.offlineExportModeInputs[1].checked).toBe(false);
        expect(mockDom.offlineExportTailSecondsInput.value).toBe("3.5");
        expect(mockActions.updateOfflineExportModeUi).toHaveBeenCalled();
    });

    it("handles errors during loadAllSettings gracefully", () => {
        const mockDom = createMockDom();
        const mockActions = {
            getArpeggioNotes: () => ["C4"],
            getSelectedPatternDirection: () => "up",
            setSelectedPatternDirection: () => {},
            updateScaleQuantizeUi: () => {},
            updateScaleQuantizeToggleText: () => {},
            updateWaveformButtons: () => {},
            setSynth: () => {},
            updateButtonGroup: () => {},
            createOrUpdatePattern: () => {
                throw new Error("Corrupt preset data");
            },
            showToast: vi.fn(),
        };

        const manager = createSettingsManager({
            state: {} as unknown as Parameters<typeof createSettingsManager>[0]["state"],
            dom: mockDom as unknown as Parameters<typeof createSettingsManager>[0]["dom"],
            actions: mockActions as unknown as Parameters<
                typeof createSettingsManager
            >[0]["actions"],
            audio: {} as unknown as Parameters<typeof createSettingsManager>[0]["audio"],
        });

        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            manager.loadAllSettings({ bpm: 120 });
            expect(mockActions.showToast).toHaveBeenCalledWith(
                expect.stringContaining("Error loading preset"),
                "error",
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "Failed to parse preset:",
                expect.any(Error),
            );
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it("handles legacy string-formatted note sequences in loadAllSettings", () => {
        const mockDom = createMockDom();
        const mockState = {
            currentNotes: ["C4"],
            currentOctaveShift: 0,
            currentOctaveRange: 1,
            currentWaveform: "sine",
            activeSynth: null,
        };

        const mockActions = {
            getArpeggioNotes: () => ["C4", "E4", "G4"],
            getSelectedPatternDirection: () => "up",
            setSelectedPatternDirection: vi.fn(),
            updateScaleQuantizeUi: vi.fn(),
            updateScaleQuantizeToggleText: vi.fn(),
            updateWaveformButtons: vi.fn(),
            setSynth: vi.fn(),
            updateButtonGroup: vi.fn(),
            createOrUpdatePattern: vi.fn(),
            showToast: vi.fn(),
        };

        const manager = createSettingsManager({
            state: mockState as unknown as Parameters<typeof createSettingsManager>[0]["state"],
            dom: mockDom as unknown as Parameters<typeof createSettingsManager>[0]["dom"],
            actions: mockActions as unknown as Parameters<
                typeof createSettingsManager
            >[0]["actions"],
            audio: {
                filter: { frequency: { value: 0 }, Q: { value: 0 } },
                delay: { wet: { value: 0 } },
                reverb: { wet: { value: 0 } },
                postGain: { volume: { value: 0 } },
            } as unknown as Parameters<typeof createSettingsManager>[0]["audio"],
        });

        // notes passed as space-separated string
        manager.loadAllSettings({
            bpm: 120,
            swing: 0,
            notes: "C4 E4 G4",
            direction: "downUp",
        });

        expect(mockDom.notesInput.value).toBe("C4 E4 G4");
        expect(mockActions.setSelectedPatternDirection).toHaveBeenCalledWith("downUp");

        // empty/whitespace string fallback
        manager.loadAllSettings({
            notes: "   ",
        });
        expect(mockDom.notesInput.value).toBe("C4 E4 G4");
        expect(mockState.currentNotes).toEqual(["C4", "E4", "G4"]);

        // empty baseNotes array fallback
        manager.loadAllSettings({
            baseNotes: [],
        });
        expect(mockDom.notesInput.value).toBe("C4 E4 G4");
        expect(mockState.currentNotes).toEqual(["C4", "E4", "G4"]);
    });

    it("updates scaleQuantize toggle according to settings payload", () => {
        const mockDom = createMockDom();
        const mockActions = {
            getArpeggioNotes: () => ["C4"],
            getSelectedPatternDirection: () => "up",
            setSelectedPatternDirection: vi.fn(),
            updateScaleQuantizeUi: vi.fn(),
            updateScaleQuantizeToggleText: vi.fn(),
            updateWaveformButtons: vi.fn(),
            setSynth: vi.fn(),
            updateButtonGroup: vi.fn(),
            createOrUpdatePattern: vi.fn(),
            showToast: vi.fn(),
        };

        const manager = createSettingsManager({
            state: { currentNotes: ["C4"] } as unknown as Parameters<
                typeof createSettingsManager
            >[0]["state"],
            dom: mockDom as unknown as Parameters<typeof createSettingsManager>[0]["dom"],
            actions: mockActions as unknown as Parameters<
                typeof createSettingsManager
            >[0]["actions"],
            audio: {
                filter: { frequency: { value: 0 }, Q: { value: 0 } },
                delay: { wet: { value: 0 } },
                reverb: { wet: { value: 0 } },
                postGain: { volume: { value: 0 } },
            } as unknown as Parameters<typeof createSettingsManager>[0]["audio"],
        });

        manager.loadAllSettings({
            scaleType: "major",
            scaleQuantize: true,
        });
        expect(mockDom.scaleQuantizeToggle.checked).toBe(true);

        manager.loadAllSettings({
            scaleType: "chromatic",
            scaleQuantize: false,
        });
        expect(mockDom.scaleQuantizeToggle.checked).toBe(false);
    });

    it("falls back to alert when loadAllSettings encounters error and showToast is unavailable", () => {
        const mockDom = createMockDom();
        const mockActions = {
            getArpeggioNotes: () => ["C4"],
            getSelectedPatternDirection: () => "up",
            setSelectedPatternDirection: () => {},
            updateScaleQuantizeUi: () => {},
            updateScaleQuantizeToggleText: () => {},
            updateWaveformButtons: () => {},
            setSynth: () => {},
            updateButtonGroup: () => {},
            createOrUpdatePattern: () => {
                throw new Error("Invalid pattern");
            },
            // showToast is omitted
        };

        const originalAlert = window.alert;
        const alertSpy = vi.fn();
        window.alert = alertSpy;
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        try {
            const manager = createSettingsManager({
                state: {} as unknown as Parameters<typeof createSettingsManager>[0]["state"],
                dom: mockDom as unknown as Parameters<typeof createSettingsManager>[0]["dom"],
                actions: mockActions as unknown as Parameters<
                    typeof createSettingsManager
                >[0]["actions"],
                audio: {} as unknown as Parameters<typeof createSettingsManager>[0]["audio"],
            });

            const result = manager.loadAllSettings({ bpm: 120 });
            expect(result.ok).toBe(false);
            expect(alertSpy).toHaveBeenCalledWith(
                "Error loading preset. File may be corrupt or from an older version.",
            );
        } finally {
            window.alert = originalAlert;
            consoleErrorSpy.mockRestore();
        }
    });

    it("suppresses error toast and alert for UnsupportedSettingsVersion error", () => {
        const mockDom = createMockDom();
        const toastSpy = vi.fn();
        const mockActions = {
            getArpeggioNotes: () => ["C4"],
            getSelectedPatternDirection: () => "up",
            setSelectedPatternDirection: () => {},
            updateScaleQuantizeUi: () => {},
            updateScaleQuantizeToggleText: () => {},
            updateWaveformButtons: () => {},
            setSynth: () => {},
            updateButtonGroup: () => {},
            createOrUpdatePattern: () => {},
            showToast: toastSpy,
        };

        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            const manager = createSettingsManager({
                state: {} as unknown as Parameters<typeof createSettingsManager>[0]["state"],
                dom: mockDom as unknown as Parameters<typeof createSettingsManager>[0]["dom"],
                actions: mockActions as unknown as Parameters<
                    typeof createSettingsManager
                >[0]["actions"],
                audio: {} as unknown as Parameters<typeof createSettingsManager>[0]["audio"],
            });

            // Passing settingsVersion 999 causes normalizeSettings to throw UnsupportedSettingsVersionError
            const result = manager.loadAllSettings({ settingsVersion: 999 });
            expect(result.ok).toBe(false);
            expect(toastSpy).not.toHaveBeenCalled();
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it("restores legacy presets lacking randomSeed to default seed instead of inheriting workspace seed", () => {
        const mockDom = createMockDom();
        const mockState = {
            currentNotes: ["C4"],
            currentOctaveShift: 0,
            currentOctaveRange: 1,
            currentWaveform: "sine",
            activeSynth: { oscillator: { type: "sine" } },
            randomSeed: 0xabcdef12,
        };
        const mockActions = {
            getArpeggioNotes: () => ["C4"],
            getSelectedPatternDirection: () => "up",
            setSelectedPatternDirection: vi.fn(),
            updateScaleQuantizeUi: vi.fn(),
            updateScaleQuantizeToggleText: vi.fn(),
            updateWaveformButtons: vi.fn(),
            setSynth: vi.fn(),
            updateEnvelope: vi.fn(),
            updateButtonGroup: vi.fn(),
            createOrUpdatePattern: vi.fn(),
            updateEstimatedExportDuration: vi.fn(),
            updateOfflineExportModeUi: vi.fn(),
            showToast: vi.fn(),
        };

        const manager = createSettingsManager({
            state: mockState as unknown as Parameters<typeof createSettingsManager>[0]["state"],
            dom: mockDom as unknown as Parameters<typeof createSettingsManager>[0]["dom"],
            actions: mockActions as unknown as Parameters<
                typeof createSettingsManager
            >[0]["actions"],
            audio: {} as unknown as Parameters<typeof createSettingsManager>[0]["audio"],
        });

        // Legacy preset lacking settingsVersion and randomSeed
        const legacyPreset = {
            bpm: 128,
            notes: "C4 E4 G4",
            patternDirection: "randomWalk",
        };

        const result = manager.loadAllSettings(legacyPreset);
        expect(result.ok).toBe(true);
        expect(result.settings?.randomSeed).toBe(0x6d2b79f5);
        expect(mockState.randomSeed).toBe(0x6d2b79f5);
    });
});

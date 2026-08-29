import { describe, expect, test } from "bun:test";
import { createSettingsManager } from "@storage/settings-manager.js";

describe("Settings Manager Domain Module", () => {
    test("creates settings snapshot and formats filenames accurately", () => {
        const mockDom = {
            bpmSlider: { value: "135" },
            swingSlider: { value: "0.25" },
            postGainSlider: { value: "-6" },
            intervalSelect: { value: "8n" },
            scaleQuantizeToggle: { checked: true },
            scaleRootSelect: { value: "D" },
            scaleTypeSelect: { value: "minor" },
            synthTypeSelect: { value: "synth" },
            harmonicitySlider: { value: "2.5" },
            modIndexSlider: { value: "8.0" },
            dutySlider: { value: "0.4" },
            gateSlider: { value: "0.75" },
            envAttackSlider: { value: "0.05" },
            envDecaySlider: { value: "0.2" },
            envSustainSlider: { value: "0.4" },
            envReleaseSlider: { value: "0.8" },
            filterCutoffSlider: { value: "3500" },
            filterResonanceSlider: { value: "2.0" },
            delayMixSlider: { value: "0.3" },
            reverbMixSlider: { value: "0.4" },
            loopCountInput: { value: "4" },
            bpmValue: {},
            swingValue: {},
            postGainValue: {},
            notesInput: {},
            harmonicityValue: {},
            modIndexValue: {},
            dutyValue: {},
            gateValue: {},
            envAttackValue: {},
            envDecayValue: {},
            envSustainValue: {},
            envReleaseValue: {},
            filterCutoffValue: {},
            filterResonanceValue: {},
            delayMixValue: {},
            reverbMixValue: {},
            octaveShiftButtons: {},
            octaveRangeButtons: {},
        };

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
            syncPatternModuleState: () => {},
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

        const filename = manager.generateFilename(false);
        expect(filename).toContain("arp-135bpm-basicSynth-synth-sawtooth-8n-DFA-D-minor");

        const realtimeFilename = manager.generateFilename(true);
        expect(realtimeFilename).toContain("arp-realtime-");
    });

    test("loadAllSettings synchronizes scale type and quantization toggle state", () => {
        const mockDom = {
            bpmSlider: { value: "120" },
            bpmValue: { textContent: "" },
            swingSlider: { value: "0" },
            swingValue: { textContent: "" },
            postGainSlider: { value: "0" },
            postGainValue: { textContent: "" },
            notesInput: { value: "" },
            intervalSelect: { value: "16n" },
            scaleQuantizeToggle: { checked: false },
            scaleRootSelect: { value: "C" },
            scaleTypeSelect: { value: "major" },
            synthTypeSelect: { value: "synth" },
            harmonicitySlider: { value: "3" },
            harmonicityValue: { textContent: "" },
            modIndexSlider: { value: "10" },
            modIndexValue: { textContent: "" },
            dutySlider: { value: "0.5" },
            dutyValue: { textContent: "" },
            gateSlider: { value: "0.8" },
            gateValue: { textContent: "" },
            envAttackSlider: { value: "0.01" },
            envAttackValue: { textContent: "" },
            envDecaySlider: { value: "0.1" },
            envDecayValue: { textContent: "" },
            envSustainSlider: { value: "0.3" },
            envSustainValue: { textContent: "" },
            envReleaseSlider: { value: "0.5" },
            envReleaseValue: { textContent: "" },
            filterCutoffSlider: { value: "4000" },
            filterCutoffValue: { textContent: "" },
            filterResonanceSlider: { value: "1" },
            filterResonanceValue: { textContent: "" },
            delayMixSlider: { value: "0.2" },
            delayMixValue: { textContent: "" },
            reverbMixSlider: { value: "0.3" },
            reverbMixValue: { textContent: "" },
            loopCountInput: { value: "2" },
            octaveShiftButtons: {},
            octaveRangeButtons: {},
        };

        const mockState = {
            currentNotes: ["C4"],
            currentOctaveShift: 0,
            currentOctaveRange: 1,
            currentWaveform: "sine",
            activeSynth: null,
        };

        let uiUpdated = false;
        let toggleTextUpdated = false;

        const mockActions = {
            getArpeggioNotes: () => ["C4"],
            getSelectedPatternDirection: () => "up",
            setSelectedPatternDirection: () => {},
            updateScaleQuantizeUi: () => {
                uiUpdated = true;
            },
            updateScaleQuantizeToggleText: () => {
                toggleTextUpdated = true;
            },
            updateWaveformButtons: () => {},
            setSynth: () => {},
            updateButtonGroup: () => {},
            syncPatternModuleState: () => {},
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

        manager.loadAllSettings({
            bpm: 120,
            swing: 0,
            baseNotes: ["C4", "E4"],
            direction: "up",
            interval: "16n",
            scaleQuantize: true,
            scaleRoot: "F",
            scaleType: "minor",
            synthType: "synth",
            waveform: "sine",
            envAttack: 0.01,
            envDecay: 0.1,
            envSustain: 0.3,
            envRelease: 0.5,
            filterCutoff: 4000,
            filterResonance: 1,
            delayMix: 0.2,
            reverbMix: 0.3,
            loopCount: 2,
        });

        expect(mockDom.scaleQuantizeToggle.checked).toBe(true);
        expect(mockDom.scaleRootSelect.value).toBe("F");
        expect(mockDom.scaleTypeSelect.value).toBe("minor");
        expect(uiUpdated).toBe(true);
        expect(toggleTextUpdated).toBe(true);
    });
});

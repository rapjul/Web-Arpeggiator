import { describe, test, expect } from "bun:test";
import { createSettingsManager } from "../../js/settings-manager.js";

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
            octaveRangeButtons: {}
        };

        const mockState = {
            currentNotes: ["D4", "F4", "A4"],
            currentOctaveShift: 1,
            currentOctaveRange: 2,
            currentWaveform: "sawtooth",
            activeSynth: null
        };

        const mockActions = {
            getArpeggioNotes: (notes: string[], range: number, shift: number) => ["D5", "D6", "F5", "F6", "A5", "A6"],
            getSelectedPatternDirection: () => "upDown",
            setSelectedPatternDirection: () => {},
            updateScaleQuantizeUi: () => {},
            updateWaveformButtons: () => {},
            setSynth: () => {},
            updateButtonGroup: () => {},
            syncPatternModuleState: () => {},
            createOrUpdatePattern: () => {},
            showToast: () => {}
        };

        const mockAudio = {
            filter: { frequency: { value: 0 }, Q: { value: 0 } },
            delay: { wet: { value: 0 } },
            reverb: { wet: { value: 0 } },
            postGain: { volume: { value: 0 } }
        };

        const manager = createSettingsManager({
            state: mockState as any,
            dom: mockDom as any,
            actions: mockActions as any,
            audio: mockAudio as any
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
});

import {
    DEFAULT_SETTINGS,
    mergeSettings,
    SETTINGS_SCHEMA_VERSION,
} from "@core/settings-contract.js";
import { describe, expect, test } from "vitest";
import { FACTORY_PRESETS } from "@/config/factory-presets.js";

describe("settings contract", () => {
    test("provides the documented initial settings under a versioned schema", () => {
        expect(SETTINGS_SCHEMA_VERSION).toBe(1);
        expect(DEFAULT_SETTINGS).toMatchObject({
            bpm: 120,
            baseNotes: ["C4", "E4", "G4"],
            direction: "up",
            interval: "16n",
            scaleQuantize: true,
            synthType: "synth",
            waveform: "sine",
            octaveRange: 2,
            offlineExportMode: "tail",
        });
    });

    test("materializes independent, complete snapshots from partial presets", () => {
        const overrides = {
            bpm: 96,
            baseNotes: ["D4", "F#4", "A4"],
            synthType: "pluckSynth",
        };
        const snapshot = mergeSettings(DEFAULT_SETTINGS, overrides);

        overrides.baseNotes.push("D5");

        expect(snapshot).toMatchObject({
            bpm: 96,
            baseNotes: ["D4", "F#4", "A4"],
            synthType: "pluckSynth",
            reverbMix: 0.3,
            offlineExportTailSeconds: 2,
        });
        expect(DEFAULT_SETTINGS.baseNotes).toEqual(["C4", "E4", "G4"]);
    });

    test("makes every factory preset independent of the previously selected settings", () => {
        for (const preset of FACTORY_PRESETS) {
            const settings = mergeSettings(DEFAULT_SETTINGS, preset.settings);

            expect(settings).toMatchObject(preset.settings);
            expect(settings.postGain).toBe(DEFAULT_SETTINGS.postGain);
            expect(settings.offlineExportMode).toBe(DEFAULT_SETTINGS.offlineExportMode);
            expect(settings.baseNotes).not.toBe(DEFAULT_SETTINGS.baseNotes);
        }
    });
});

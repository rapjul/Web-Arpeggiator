import {
    ALLOWED_DIRECTIONS,
    ALLOWED_INTERVALS,
    ALLOWED_ROOTS,
    ALLOWED_SCALES,
    ALLOWED_SYNTHS,
    ALLOWED_WAVEFORMS,
} from "@core/url-preset.js";
import { describe, expect, test } from "vitest";
import { FACTORY_PRESETS } from "@/config/factory-presets.js";

describe("factory presets", () => {
    test("contain unique, valid settings that can be restored by the application", () => {
        expect(FACTORY_PRESETS).toHaveLength(11);
        expect(new Set(FACTORY_PRESETS.map((preset) => preset.id)).size).toBe(
            FACTORY_PRESETS.length,
        );

        const lofiBeats = FACTORY_PRESETS.find((preset) => preset.id === "factory-lofi-beats");
        expect(lofiBeats).toBeDefined();
        expect(lofiBeats?.name).toBe("Lo-Fi Chillhop");
        expect(lofiBeats?.settings.synthType).toBe("synth");
        expect(lofiBeats?.settings.waveform).toBe("sine");

        const berlin = FACTORY_PRESETS.find((preset) => preset.id === "factory-berlin");
        expect(berlin).toBeDefined();
        expect(berlin?.name).toBe("Cosmic Sequencer");

        const darkwave = FACTORY_PRESETS.find((preset) => preset.id === "factory-darkwave");
        expect(darkwave).toBeDefined();
        expect(darkwave?.settings.scaleType).toBe("phrygian");

        const acid = FACTORY_PRESETS.find((preset) => preset.id === "factory-acid");
        expect(acid).toBeDefined();
        expect(acid?.settings.synthType).toBe("monoSynth");

        const synthwave = FACTORY_PRESETS.find((preset) => preset.id === "factory-synthwave");
        expect(synthwave).toBeDefined();
        expect(synthwave?.settings.octaveRange).toBe(1);
        expect(synthwave?.settings.baseNotes).toEqual([
            "A2",
            "E3",
            "A3",
            "C4",
            "E4",
            "G4",
            "A4",
            "B4",
        ]);

        for (const preset of FACTORY_PRESETS) {
            const { settings } = preset;

            expect(preset.isFactory).toBe(true);
            expect(preset.name).not.toBe("");
            expect(ALLOWED_DIRECTIONS).toContain(settings.direction);
            expect(ALLOWED_INTERVALS).toContain(settings.interval);
            expect(ALLOWED_ROOTS).toContain(settings.scaleRoot);
            expect(ALLOWED_SCALES).toContain(settings.scaleType);
            expect(ALLOWED_SYNTHS).toContain(settings.synthType);
            expect(ALLOWED_WAVEFORMS).toContain(settings.waveform);
            expect(settings.scaleQuantize).toBe(true);
            expect(settings.octaveRange).toBe(1);
            expect(Array.isArray(settings.baseNotes)).toBe(true);
            expect(settings.baseNotes).not.toHaveLength(0);
        }
    });
});

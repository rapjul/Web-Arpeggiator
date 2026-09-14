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
        expect(FACTORY_PRESETS).toHaveLength(6);
        expect(new Set(FACTORY_PRESETS.map((preset) => preset.id)).size).toBe(
            FACTORY_PRESETS.length,
        );

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
            expect(Array.isArray(settings.baseNotes)).toBe(true);
            expect(settings.baseNotes).not.toHaveLength(0);
        }
    });
});

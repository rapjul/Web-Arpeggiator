import { describe, expect, test } from "vitest";
import {
    clampFloat,
    clampInt,
    hasPresetChanges,
    NOTES_REGEX,
    parsePresetFromUrlParams,
    serializePresetToUrlParams,
} from "@core/url-preset.js";

describe("URL Preset Domain Module", () => {
    const defaultSettings = {
        bpm: 120,
        swing: 0,
        postGain: 0,
        baseNotes: ["C4", "E4", "G4"],
        direction: "up",
        interval: "16n",
        scaleQuantize: false,
        scaleRoot: "C",
        scaleType: "major",
        synthType: "synth",
        waveform: "sine",
        harmonicity: 3.0,
        modulationIndex: 10.0,
        dutyCycle: 0.5,
        gateRatio: 0.8,
        octaveShift: 0,
        octaveRange: 1,
        envAttack: 0.01,
        envDecay: 0.1,
        envSustain: 0.3,
        envRelease: 0.5,
        filterCutoff: 4000,
        filterResonance: 1.0,
        delayMix: 0.2,
        reverbMix: 0.3,
        driveMix: 0,
        chorusMix: 0,
        autoPanMix: 0,
        loopCount: 2,
    };

    test("clampInt correctly clamps values between bounds and handles invalid inputs", () => {
        expect(clampInt("150", 40, 240, 120)).toBe(150);
        expect(clampInt("300", 40, 240, 120)).toBe(240);
        expect(clampInt("10", 40, 240, 120)).toBe(40);
        expect(clampInt("invalid", 40, 240, 120)).toBe(120);
        expect(clampInt(null, 40, 240, 120)).toBe(120);
    });

    test("clampFloat correctly clamps floating point values between bounds", () => {
        expect(clampFloat("0.5", 0.0, 1.0, 0.0)).toBe(0.5);
        expect(clampFloat("1.8", 0.0, 1.0, 0.0)).toBe(1.0);
        expect(clampFloat("-5.0", 0.0, 1.0, 0.0)).toBe(0.0);
        expect(clampFloat("abc", 0.0, 1.0, 0.5)).toBe(0.5);
    });

    test("NOTES_REGEX strictly validates note sequences including bare notes", () => {
        expect(NOTES_REGEX.test("C4 E4 G4")).toBe(true);
        expect(NOTES_REGEX.test("F#3 Bb4 Db5")).toBe(true);
        expect(NOTES_REGEX.test("C4")).toBe(true);
        expect(NOTES_REGEX.test("C E G")).toBe(true);
        expect(NOTES_REGEX.test("c e g")).toBe(true);
        expect(NOTES_REGEX.test("c4 eb g# bb")).toBe(true);
        expect(NOTES_REGEX.test("InvalidNote")).toBe(false);
        expect(NOTES_REGEX.test("<script>")).toBe(false);
        expect(NOTES_REGEX.test("C4 E4 123")).toBe(false);
    });

    test("parses bare note sequences from URL params into normalized fourth-octave notes", () => {
        const query = "?notes=c%20e%20g";
        const parsed = parsePresetFromUrlParams(query, defaultSettings);
        expect(parsed).not.toBeNull();
        expect(parsed?.baseNotes).toEqual(["C4", "E4", "G4"]);
    });

    test("serializes settings to URLSearchParams with formatted numeric fields", () => {
        const params = serializePresetToUrlParams(defaultSettings);
        expect(params.get("bpm")).toBe("120");
        expect(params.get("notes")).toBe("C4 E4 G4");
        expect(params.get("dir")).toBe("up");
        expect(params.get("int")).toBe("16n");
        expect(params.get("quant")).toBe("false");
        expect(params.get("gain")).toBe("0");
        expect(params.get("duty")).toBe("0.50");
        expect(params.get("loop")).toBe("2");
    });

    test("parses and clamps URL search parameters correctly", () => {
        const query =
            "?bpm=300&gain=-60&notes=F#4%20A4%20C#5&dir=downUpRepeat&int=8n&quant=true&root=F#&scale=minor&synth=fmSynth&harm=4.5&mod=25.0&shift=2&range=3&attack=0.25&decay=0.5&sustain=0.75&release=1.5&cutoff=8000&res=12.0&delay=0.4&reverb=0.6&loop=150";

        const parsed = parsePresetFromUrlParams(query, defaultSettings);
        expect(parsed).not.toBeNull();

        // Verify clamping
        expect(parsed?.bpm).toBe(240); // Clamped from 300
        expect(parsed?.postGain).toBe(-40); // Clamped from -60
        expect(parsed?.loopCount).toBe(100); // Clamped from 150

        // Verify valid settings applied
        expect(parsed?.baseNotes).toEqual(["F#4", "A4", "C#5"]);
        expect(parsed?.direction).toBe("downUpRepeat");
        expect(parsed?.interval).toBe("8n");
        expect(parsed?.scaleQuantize).toBe(true);
        expect(parsed?.scaleRoot).toBe("F#");
        expect(parsed?.scaleType).toBe("minor");
        expect(parsed?.synthType).toBe("fmSynth");
        expect(parsed?.harmonicity).toBe(4.5);
        expect(parsed?.octaveShift).toBe(2);
        expect(parsed?.octaveRange).toBe(3);
        expect(parsed?.filterCutoff).toBe(8000);
    });

    test("returns null when no recognized preset keys are present", () => {
        expect(parsePresetFromUrlParams("?pwa=true", defaultSettings)).toBeNull();
        expect(parsePresetFromUrlParams("?unknown=value&foo=bar", defaultSettings)).toBeNull();
        expect(parsePresetFromUrlParams("", defaultSettings)).toBeNull();
    });

    test("hasPresetChanges detects differences accurately", () => {
        const copy = { ...defaultSettings };
        expect(hasPresetChanges(defaultSettings, copy)).toBe(false);

        // Note change
        expect(
            hasPresetChanges(defaultSettings, {
                ...defaultSettings,
                baseNotes: ["D4", "F4"],
            }),
        ).toBe(true);

        // BPM change
        expect(hasPresetChanges(defaultSettings, { ...defaultSettings, bpm: 130 })).toBe(true);

        // Float precision within epsilon
        expect(
            hasPresetChanges(defaultSettings, {
                ...defaultSettings,
                swing: 0.00000000001,
            }),
        ).toBe(false);

        // Waveform change
        expect(
            hasPresetChanges(defaultSettings, {
                ...defaultSettings,
                waveform: "square",
            }),
        ).toBe(true);

        // All scalar and numeric property change branches
        const keysToTest: (keyof typeof defaultSettings)[] = [
            "direction",
            "interval",
            "synthType",
            "waveform",
            "scaleRoot",
            "scaleType",
            "scaleQuantize",
            "bpm",
            "swing",
            "postGain",
            "harmonicity",
            "modulationIndex",
            "dutyCycle",
            "gateRatio",
            "octaveShift",
            "octaveRange",
            "envAttack",
            "envDecay",
            "envSustain",
            "envRelease",
            "filterCutoff",
            "filterResonance",
            "driveMix",
            "chorusMix",
            "autoPanMix",
            "delayMix",
            "reverbMix",
            "loopCount",
        ];

        for (const key of keysToTest) {
            const val = defaultSettings[key];
            const modifiedVal =
                typeof val === "number"
                    ? val + 1
                    : typeof val === "boolean"
                      ? !val
                      : `${String(val)}-diff`;

            expect(
                hasPresetChanges(defaultSettings, {
                    ...defaultSettings,
                    [key]: modifiedVal,
                }),
            ).toBe(true);
        }

        // Null / undefined objects check
        expect(hasPresetChanges(null as any, defaultSettings)).toBe(true);
        expect(hasPresetChanges(defaultSettings, null as any)).toBe(true);
    });

    test("serializes and parses new synths and studio effect parameters", () => {
        const customSettings = {
            ...defaultSettings,
            synthType: "monoSynth",
            driveMix: 0.65,
            chorusMix: 0.45,
            autoPanMix: 0.8,
        };

        const params = serializePresetToUrlParams(customSettings);
        expect(params.get("synth")).toBe("monoSynth");
        expect(params.get("drive")).toBe("0.65");
        expect(params.get("chorus")).toBe("0.45");
        expect(params.get("pan")).toBe("0.80");

        const parsed = parsePresetFromUrlParams(params, defaultSettings);
        expect(parsed?.synthType).toBe("monoSynth");
        expect(parsed?.driveMix).toBe(0.65);
        expect(parsed?.chorusMix).toBe(0.45);
        expect(parsed?.autoPanMix).toBe(0.8);
    });
});

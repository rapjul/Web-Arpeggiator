import {
    DEFAULT_SETTINGS,
    mergeSettings,
    normalizeSettings,
    normalizeSettingsHistory,
    SETTINGS_SCHEMA_VERSION,
    UnsupportedSettingsVersionError,
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

    test("normalizes a complete imported snapshot into supported control values", () => {
        const importedSettings = {
            bpm: 172,
            swing: 0.35,
            postGain: -12,
            baseNotes: ["D4", "F#4", "A4"],
            direction: "randomWalkDrunk",
            interval: "8n",
            octaveShift: -2,
            octaveRange: 4,
            scaleQuantize: false,
            scaleRoot: "F#",
            scaleType: "dorian",
            synthType: "monoSynth",
            waveform: "pulse",
            harmonicity: 4,
            modulationIndex: 24,
            dutyCycle: 0.7,
            gateRatio: 0.6,
            monoCutoff: 500,
            monoOctaves: 6,
            monoQ: 3,
            duoHarm: 2,
            duoVibrato: 0.4,
            pluckDampening: 3000,
            pluckResonance: 0.7,
            pluckNoise: 2,
            membranePitchDecay: 0.2,
            membraneOctaves: 10,
            envAttack: 0.2,
            envDecay: 0.3,
            envSustain: 0.6,
            envRelease: 1.2,
            filterCutoff: 2500,
            filterResonance: 5,
            driveMix: 0.1,
            chorusMix: 0.2,
            autoPanMix: 0.3,
            delayMix: 0.4,
            reverbMix: 0.5,
            loopCount: 8,
            offlineExportMode: "seamless",
            offlineExportTailSeconds: 4,
        };
        const settings = normalizeSettings(importedSettings);

        expect(settings).toMatchObject({ ...importedSettings, settingsVersion: 1 });
        expect(settings.notes).toEqual([
            "D2",
            "D3",
            "D4",
            "D5",
            "Gb2",
            "Gb3",
            "Gb4",
            "Gb5",
            "A2",
            "A3",
            "A4",
            "A5",
        ]);
    });

    test("falls back safely when an import has malformed values", () => {
        const fallback = mergeSettings(DEFAULT_SETTINGS, {
            bpm: 144,
            baseNotes: ["E4", "G4", "B4"],
            direction: "down",
            synthType: "fmSynth",
            waveform: "square",
        });
        const settings = normalizeSettings(
            {
                bpm: Number.POSITIVE_INFINITY,
                swing: -2,
                postGain: -100,
                baseNotes: ["C4", 12],
                direction: "not-a-pattern",
                interval: "99n",
                octaveShift: 2.8,
                octaveRange: 7.2,
                scaleQuantize: "yes",
                scaleRoot: "H",
                scaleType: "not-a-scale",
                synthType: "not-a-synth",
                waveform: "not-a-wave",
                harmonicity: 100,
                modulationIndex: -1,
                dutyCycle: 2,
                gateRatio: 0,
                monoCutoff: 0,
                monoOctaves: 20,
                monoQ: -1,
                duoHarm: 20,
                duoVibrato: 2,
                pluckDampening: -1,
                pluckResonance: 2,
                pluckNoise: 20,
                membranePitchDecay: 2,
                membraneOctaves: 20,
                envAttack: -1,
                envDecay: 20,
                envSustain: 2,
                envRelease: -1,
                filterCutoff: 20,
                filterResonance: 100,
                driveMix: -1,
                chorusMix: 2,
                autoPanMix: -1,
                delayMix: 2,
                reverbMix: -1,
                loopCount: 101,
                offlineExportMode: "invalid",
                offlineExportTailSeconds: 99,
            },
            fallback,
        );

        expect(settings).toMatchObject({
            bpm: 144,
            swing: 0,
            postGain: -40,
            baseNotes: ["E4", "G4", "B4"],
            direction: "down",
            interval: "16n",
            octaveShift: 2,
            octaveRange: 5,
            scaleQuantize: true,
            scaleRoot: "C",
            scaleType: "major",
            synthType: "fmSynth",
            waveform: "square",
            harmonicity: 10,
            modulationIndex: 1,
            dutyCycle: 0.99,
            gateRatio: 0.05,
            monoCutoff: 20,
            monoOctaves: 8,
            monoQ: 0,
            duoHarm: 10,
            duoVibrato: 1,
            pluckDampening: 0,
            pluckResonance: 1,
            pluckNoise: 10,
            membranePitchDecay: 1,
            membraneOctaves: 16,
            envAttack: 0,
            envDecay: 2,
            envSustain: 1,
            envRelease: 0,
            filterCutoff: 100,
            filterResonance: 20,
            driveMix: 0,
            chorusMix: 1,
            autoPanMix: 0,
            delayMix: 1,
            reverbMix: 0,
            loopCount: 100,
            offlineExportMode: "tail",
            offlineExportTailSeconds: 10,
        });
    });

    test("returns a detached default snapshot for a corrupted import", () => {
        const settings = normalizeSettings(["not", "a", "settings", "record"]);

        expect(settings).toMatchObject(DEFAULT_SETTINGS);
        expect(settings.baseNotes).not.toBe(DEFAULT_SETTINGS.baseNotes);
        expect(DEFAULT_SETTINGS.baseNotes).toEqual(["C4", "E4", "G4"]);
    });

    test("upgrades unversioned settings and derives expanded notes", () => {
        const settings = normalizeSettings({ baseNotes: ["D4", "F#4"], octaveRange: 2 });

        expect(settings.settingsVersion).toBe(SETTINGS_SCHEMA_VERSION);
        expect(settings.notes).toEqual(["D4", "D5", "Gb4", "Gb5"]);
    });

    test("rejects future settings unless an explicit compatibility override is used", () => {
        const futurePreset = { settingsVersion: 99, bpm: 96, baseNotes: ["A3", "C4"] };

        expect(() => normalizeSettings(futurePreset)).toThrow(UnsupportedSettingsVersionError);
        expect(
            normalizeSettings(futurePreset, DEFAULT_SETTINGS, { allowFutureVersion: true }),
        ).toMatchObject({ settingsVersion: 1, bpm: 96, baseNotes: ["A3", "C4"] });
    });

    test("normalizes every legacy history snapshot before restoration", () => {
        const history = normalizeSettingsHistory({
            past: [{ bpm: 100, baseNotes: ["C4"] }],
            present: { bpm: 110, baseNotes: ["D4"] },
            future: [{ bpm: 120, baseNotes: ["E4"] }],
        });

        expect(history).toMatchObject({
            past: [{ settingsVersion: 1, bpm: 100, baseNotes: ["C4"] }],
            present: { settingsVersion: 1, bpm: 110, baseNotes: ["D4"] },
            future: [{ settingsVersion: 1, bpm: 120, baseNotes: ["E4"] }],
        });
        expect(normalizeSettingsHistory({ past: [], present: null, future: [] })).toBeNull();
    });
});

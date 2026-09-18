/**
 * @file Unit tests for versioned offline export metadata.
 */

import { describe, expect, it } from "vitest";
import {
    createOfflineExportMetadata,
    OFFLINE_EXPORT_METADATA_SCHEMA,
    OFFLINE_EXPORT_METADATA_VERSION,
} from "@core/export-metadata.js";

describe("Offline export metadata", () => {
    it("captures a complete independent settings and render snapshot", () => {
        const settings = {
            bpm: 123,
            baseNotes: ["C4", "E4", "G4"],
            direction: "random",
            envRelease: 1.2,
            delayMix: 0.4,
            reverbMix: 0.6,
            offlineExportMode: "seamless",
            offlineExportTailSeconds: 0,
        };
        const patternNotes = ["C4", "G4", "E4"];
        const metadata = createOfflineExportMetadata({
            settings,
            patternNotes,
            exportDuration: {
                exportMode: "seamless",
                loopCount: 3,
                musicalDuration: 2.5,
                preRollCycles: 4,
                preRollDuration: 3.25,
                tailDuration: 0,
                renderDuration: 5.75,
            },
            sampleRate: 44100,
            channelCount: 2,
            frameCount: 110250,
        });

        settings.baseNotes[0] = "D4";
        patternNotes[0] = "D4";

        expect(metadata).toEqual({
            schema: OFFLINE_EXPORT_METADATA_SCHEMA,
            version: OFFLINE_EXPORT_METADATA_VERSION,
            application: "Web Arpeggiator",
            export: {
                type: "offline-audio",
                mode: "seamless",
                loopCount: 3,
                musicalDurationSeconds: 2.5,
                preRollCycles: 4,
                preRollDurationSeconds: 3.25,
                tailDurationSeconds: 0,
                renderDurationSeconds: 5.75,
                sampleRate: 44100,
                channelCount: 2,
                frameCount: 110250,
            },
            pattern: {
                scheduledNotes: ["C4", "G4", "E4"],
                stepsPerCycle: 3,
                cycleCount: 3,
                stepsPerLoop: 3,
            },
            settings: {
                bpm: 123,
                baseNotes: ["C4", "E4", "G4"],
                direction: "random",
                envRelease: 1.2,
                delayMix: 0.4,
                reverbMix: 0.6,
                offlineExportMode: "seamless",
                offlineExportTailSeconds: 0,
            },
        });
    });

    it("falls back safely when settings cannot be serialized", () => {
        const circularSettings: { self?: unknown } = {};
        circularSettings.self = circularSettings;
        const metadata = createOfflineExportMetadata({
            settings: circularSettings,
            patternNotes: null as unknown as string[],
            exportDuration: {
                exportMode: "tail",
                loopCount: 1,
                musicalDuration: 1,
                preRollCycles: 0,
                preRollDuration: 0,
                tailDuration: 2,
                renderDuration: 3,
            },
            sampleRate: 44100,
            channelCount: 1,
            frameCount: 44100,
        });

        expect(metadata.pattern).toEqual({
            scheduledNotes: [],
            stepsPerCycle: 0,
            cycleCount: 1,
            stepsPerLoop: 0,
        });
        expect(metadata.settings).toEqual({});
    });
});

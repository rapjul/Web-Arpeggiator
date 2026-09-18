import { describe, expect, it } from "vitest";
import { createApplicationState } from "@/state/application-state.js";

interface AudioEngineFixture {
    activeSynth: object | null;
    currentWaveform: string;
}

type ApplicationStateDependencies = Parameters<typeof createApplicationState>[0];

function createDependencies(
    getEngine: () => AudioEngineFixture | null | undefined,
): ApplicationStateDependencies {
    return { getAvailableAudioEngine: getEngine };
}

describe("createApplicationState", () => {
    it("preserves the application defaults", () => {
        const state = createApplicationState(createDependencies(() => undefined));

        expect(state.isPlaying).toBe(false);
        expect(state.currentNotes).toEqual(["C4", "E4", "G4"]);
        expect(state.currentOctaveShift).toBe(0);
        expect(state.currentOctaveRange).toBe(2);
        expect(state.randomSeed).toBe(0x6d2b79f5);
        expect(state.activeSynth).toBeNull();
        expect(state.currentWaveform).toBe("sine");
        expect(state.activeNote).toBeNull();
        expect(state.isAudioContextStarted).toBe(false);
    });

    it("keeps state instances independent and exposes mutable values", () => {
        const first = createApplicationState(createDependencies(() => undefined));
        const second = createApplicationState(createDependencies(() => undefined));

        first.isPlaying = true;
        first.currentNotes = ["D4", "F4", "A4"];
        first.currentOctaveShift = -1;
        first.currentOctaveRange = 4;
        first.randomSeed = 42;
        first.activeNote = "C5";
        first.isAudioContextStarted = true;

        expect(first.isPlaying).toBe(true);
        expect(first.currentNotes).toEqual(["D4", "F4", "A4"]);
        expect(first.currentOctaveShift).toBe(-1);
        expect(first.currentOctaveRange).toBe(4);
        expect(first.randomSeed).toBe(42);
        expect(first.activeNote).toBe("C5");
        expect(first.isAudioContextStarted).toBe(true);
        expect(second.isPlaying).toBe(false);
        expect(second.currentNotes).toEqual(["C4", "E4", "G4"]);
        expect(second.currentOctaveShift).toBe(0);
        expect(second.currentOctaveRange).toBe(2);
        expect(second.randomSeed).toBe(0x6d2b79f5);
        expect(second.activeNote).toBeNull();
        expect(second.isAudioContextStarted).toBe(false);
    });

    it("proxies active synth and waveform access to the available engine", () => {
        let engine: AudioEngineFixture | null = {
            activeSynth: { id: "synth" },
            currentWaveform: "square",
        };
        const state = createApplicationState(createDependencies(() => engine));
        const replacementSynth = { id: "replacement" };

        expect(state.activeSynth).toBe(engine.activeSynth);
        expect(state.currentWaveform).toBe("square");

        state.activeSynth = replacementSynth;
        expect(state.activeSynth).not.toBe(replacementSynth);
        expect(engine.activeSynth).toEqual({ id: "synth" });

        state.currentWaveform = "triangle";
        expect(engine.currentWaveform).toBe("triangle");
        engine.currentWaveform = "sawtooth";
        expect(state.currentWaveform).toBe("sawtooth");

        engine = null;
        expect(state.currentWaveform).toBe("triangle");
    });

    it("retains the waveform fallback until an engine is available", () => {
        let engine: AudioEngineFixture | undefined;
        const state = createApplicationState(createDependencies(() => engine));

        state.currentWaveform = "square";
        expect(state.currentWaveform).toBe("square");

        engine = { activeSynth: null, currentWaveform: "sine" };
        expect(state.currentWaveform).toBe("sine");
        state.currentWaveform = "triangle";
        expect(engine.currentWaveform).toBe("triangle");
    });
});

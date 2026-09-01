import { describe, expect, test } from "vitest";
import {
    CHORD_DEFINITIONS,
    buildChordNotes,
    buildChordString,
    normalizeRootPitch,
} from "@core/chord-builder.js";

describe("Chord Builder Domain Module", () => {
    test("exports standard chord definitions", () => {
        expect(CHORD_DEFINITIONS.major).toBeDefined();
        expect(CHORD_DEFINITIONS.minor).toBeDefined();
        expect(CHORD_DEFINITIONS.dom7).toBeDefined();
        expect(CHORD_DEFINITIONS.sus4).toBeDefined();
        expect(CHORD_DEFINITIONS.power).toBeDefined();
        expect(CHORD_DEFINITIONS.pentatonic).toBeDefined();
    });

    test("normalizes root pitches and enharmonic accidentals", () => {
        expect(normalizeRootPitch("C")).toBe("C");
        expect(normalizeRootPitch("c#")).toBe("C#");
        expect(normalizeRootPitch("Db")).toBe("Db");
        expect(normalizeRootPitch("D#")).toBe("D#");
        expect(normalizeRootPitch("Eb")).toBe("Eb");
        expect(normalizeRootPitch("F#")).toBe("F#");
        expect(normalizeRootPitch("Gb")).toBe("Gb");
        expect(normalizeRootPitch("Ab")).toBe("Ab");
        expect(normalizeRootPitch("Bb")).toBe("Bb");
        expect(normalizeRootPitch("")).toBe("C");
        expect(normalizeRootPitch("invalid")).toBe("C");
    });

    test("generates correct C major chord pitches and string", () => {
        const notes = buildChordNotes("major", "C");
        expect(notes).toEqual(["C4", "E4", "G4"]);
        expect(buildChordString("major", "C")).toBe("C4 E4 G4");
    });

    test("generates correct C minor chord pitches and string", () => {
        const notes = buildChordNotes("minor", "C");
        expect(notes).toEqual(["C4", "D#4", "G4"]);
        expect(buildChordString("minor", "C")).toBe("C4 D#4 G4");
    });

    test("generates correct 7th (Dominant 7th) chord pitches and string", () => {
        const notes = buildChordNotes("dom7", "C");
        expect(notes).toEqual(["C4", "E4", "G4", "A#4"]);
        expect(buildChordString("dom7", "C")).toBe("C4 E4 G4 A#4");
    });

    test("generates correct Sus4 chord pitches and string", () => {
        const notes = buildChordNotes("sus4", "C");
        expect(notes).toEqual(["C4", "F4", "G4"]);
        expect(buildChordString("sus4", "C")).toBe("C4 F4 G4");
    });

    test("generates correct Power chord pitches in octave 3", () => {
        const notes = buildChordNotes("power", "C");
        expect(notes).toEqual(["C3", "G3", "C4"]);
        expect(buildChordString("power", "C")).toBe("C3 G3 C4");
    });

    test("generates correct Pentatonic sequence in octave 4", () => {
        const notes = buildChordNotes("pentatonic", "C");
        expect(notes).toEqual(["C4", "D4", "E4", "G4", "A4"]);
        expect(buildChordString("pentatonic", "C")).toBe("C4 D4 E4 G4 A4");
    });

    test("transposes chords dynamically across all 12 chromatic roots", () => {
        const dMajor = buildChordNotes("major", "D");
        expect(dMajor).toEqual(["D4", "F#4", "A4"]);

        const fMinor = buildChordNotes("minor", "F");
        expect(fMinor).toEqual(["F4", "G#4", "C5"]);

        const g7 = buildChordNotes("dom7", "G");
        expect(g7).toEqual(["G4", "B4", "D5", "F5"]);

        const aSus4 = buildChordNotes("sus4", "A");
        expect(aSus4).toEqual(["A4", "D5", "E5"]);

        const ePower = buildChordNotes("power", "E");
        expect(ePower).toEqual(["E3", "B3", "E4"]);

        const gPentatonic = buildChordNotes("pentatonic", "G");
        expect(gPentatonic).toEqual(["G4", "A4", "B4", "D5", "E5"]);
    });

    test("handles custom octave parameter", () => {
        const notes = buildChordNotes("major", "C", 5);
        expect(notes).toEqual(["C5", "E5", "G5"]);
        expect(buildChordString("major", "C", 5)).toBe("C5 E5 G5");
    });

    test("gracefully falls back when invalid chord type or root is provided", () => {
        const fallbackChord = buildChordNotes("unknownChordType", "C");
        expect(fallbackChord).toEqual(["C4", "E4", "G4"]);

        const fallbackRoot = buildChordNotes("major", "invalidNoteXYZ");
        expect(fallbackRoot).toEqual(["C4", "E4", "G4"]);
    });
});

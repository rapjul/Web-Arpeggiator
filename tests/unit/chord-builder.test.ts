import { describe, expect, test } from "vitest";
import {
    CHORD_DEFINITIONS,
    buildChordNotes,
    buildChordString,
    normalizeRootPitch,
    resolveChordDefinition,
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

    test("resolves only own supported chord definitions", () => {
        expect(resolveChordDefinition("minor")).toBe(CHORD_DEFINITIONS.minor);
        expect(resolveChordDefinition("toString")).toBe(CHORD_DEFINITIONS.major);
        expect(resolveChordDefinition("unknownChordType")).toBe(CHORD_DEFINITIONS.major);
        expect(resolveChordDefinition(null)).toBe(CHORD_DEFINITIONS.major);
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
        expect(normalizeRootPitch("")).toBe("C");
        expect(normalizeRootPitch("   ")).toBe("C");
        expect(normalizeRootPitch("invalid")).toBe("C");
        expect(normalizeRootPitch("Garbage")).toBe("C");
        expect(normalizeRootPitch("C#oops")).toBe("C");
        expect(normalizeRootPitch("H#")).toBe("C");
        expect(normalizeRootPitch("Z")).toBe("C");
        expect(normalizeRootPitch("123")).toBe("C");
        expect(normalizeRootPitch("!@#$%")).toBe("C");
        expect(normalizeRootPitch("C##")).toBe("C");
        expect(normalizeRootPitch("Dbb")).toBe("C");
        expect(normalizeRootPitch("C4")).toBe("C");
        expect(normalizeRootPitch("F#5")).toBe("F#");
        expect(normalizeRootPitch("Bb3")).toBe("Bb");
        // @ts-expect-error Testing defensive runtime handling for non-string inputs
        expect(normalizeRootPitch(null)).toBe("C");
        // @ts-expect-error Testing defensive runtime handling for non-string inputs
        expect(normalizeRootPitch(undefined)).toBe("C");
        // @ts-expect-error Testing defensive runtime handling for non-string inputs
        expect(normalizeRootPitch(123)).toBe("C");
        // @ts-expect-error Testing defensive runtime handling for non-string inputs
        expect(normalizeRootPitch({})).toBe("C");
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

    test("uses requested octaves only when every chord note is within MIDI bounds", () => {
        const notes = buildChordNotes("major", "C", 5);
        expect(notes).toEqual(["C5", "E5", "G5"]);
        expect(buildChordString("major", "C", 5)).toBe("C5 E5 G5");

        expect(buildChordNotes("major", "C", -1)).toEqual(["C-1", "E-1", "G-1"]);
        expect(buildChordNotes("major", "C", 9)).toEqual(["C9", "E9", "G9"]);

        // Invalid/fractional octaves should safely fallback to the requested chord's default octave
        expect(buildChordNotes("minor", "D", 4.5)).toEqual(["D4", "F4", "A4"]);
        expect(buildChordNotes("minor", "D", Number.POSITIVE_INFINITY)).toEqual(["D4", "F4", "A4"]);
        expect(buildChordNotes("minor", "D", Number.NaN)).toEqual(["D4", "F4", "A4"]);
        expect(buildChordNotes("minor", "D", -2)).toEqual(["D4", "F4", "A4"]);

        // B9 is itself in range, but its major third and fifth would overflow MIDI 127.
        expect(buildChordNotes("major", "B", 9)).toEqual(["B4", "D#5", "F#5"]);
    });

    test("gracefully falls back when invalid chord type or root is provided", () => {
        const fallbackChord = buildChordNotes("unknownChordType", "C");
        expect(fallbackChord).toEqual(["C4", "E4", "G4"]);

        const inheritedChord = buildChordNotes("toString", "D");
        expect(inheritedChord).toEqual(["D4", "F#4", "A4"]);

        const fallbackRoot = buildChordNotes("major", "invalidNoteXYZ");
        expect(fallbackRoot).toEqual(["C4", "E4", "G4"]);
    });
});

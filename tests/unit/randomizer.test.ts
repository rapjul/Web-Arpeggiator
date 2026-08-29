import { describe, expect, test } from "bun:test";
import * as Tonal from "tonal";
import { DEFAULT_SCALE_FALLBACKS, generateRandomNotes } from "@core/randomizer.js";

describe("Randomizer Domain Module", () => {
    test("exports expected default scale fallbacks", () => {
        expect(DEFAULT_SCALE_FALLBACKS).toContain("major");
        expect(DEFAULT_SCALE_FALLBACKS).toContain("minor");
        expect(DEFAULT_SCALE_FALLBACKS).toContain("dorian");
    });

    test("generates 4 to 6 unique notes in ascending order", () => {
        const notes = generateRandomNotes("C", "major");
        expect(notes.length).toBeGreaterThanOrEqual(4);
        expect(notes.length).toBeLessThanOrEqual(6);

        // Verify strictly ascending MIDI pitches
        for (let i = 1; i < notes.length; i++) {
            const prevMidi = Tonal.Note.midi(notes[i - 1]) ?? 0;
            const currMidi = Tonal.Note.midi(notes[i]) ?? 0;
            expect(currMidi).toBeGreaterThan(prevMidi);
        }
    });

    test("restricts generated notes to allowed octaves 3, 4, 5", () => {
        for (let run = 0; run < 20; run++) {
            const notes = generateRandomNotes("G", "minor");
            notes.forEach((note) => {
                const oct = Tonal.Note.octave(note);
                expect([3, 4, 5]).toContain(oct);
            });
        }
    });

    test("strictly contains only pitches from the selected scale (F Minor)", () => {
        const fMinorScale = Tonal.Scale.get("F minor");
        const scalePitchClasses = fMinorScale.notes.map((n) => Tonal.Note.pitchClass(n));

        const notes = generateRandomNotes("F", "minor");
        notes.forEach((note) => {
            const pc = Tonal.Note.pitchClass(note);
            expect(scalePitchClasses).toContain(pc);
        });
    });

    test("supports chromatic mode by choosing from fallback scales", () => {
        const notes = generateRandomNotes("D", "chromatic");
        expect(notes.length).toBeGreaterThanOrEqual(4);
        expect(notes.length).toBeLessThanOrEqual(6);
    });

    test("supports custom count constraints and deterministic RNG", () => {
        let rngCounter = 0;
        const mockRng = () => {
            rngCounter = (rngCounter + 0.13) % 1;
            return rngCounter;
        };

        const notes = generateRandomNotes("A", "dorian", {
            minCount: 5,
            maxCount: 5,
            octaves: [4],
            rng: mockRng,
        });

        expect(notes.length).toBe(5);
        notes.forEach((note) => {
            expect(Tonal.Note.octave(note)).toBe(4);
        });
    });

    test("gracefully falls back when invalid root or scale is passed", () => {
        const notes = generateRandomNotes("", "");
        expect(notes.length).toBeGreaterThanOrEqual(4);
        expect(notes.length).toBeLessThanOrEqual(6);
    });
});

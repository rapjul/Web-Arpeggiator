import { describe, expect, it } from "vitest";
import { resolveChordConflict } from "@core/chord-conflict.js";

describe("resolveChordConflict", () => {
    it("applies a compatible chord without changing its pitches", () => {
        const result = resolveChordConflict(
            { chordType: "major", root: "C" },
            { enabled: true, root: "C", scale: "major" },
        );

        expect(result.hasConflict).toBe(false);
        expect(result.requestedNotes).toEqual(["C4", "E4", "G4"]);
        expect(result.adaptedNotes).toEqual(result.requestedNotes);
        expect(result.changedPitches).toEqual([]);
    });

    it("returns both the requested and adapted notes for a conflicting chord", () => {
        const result = resolveChordConflict(
            { chordType: "minor", root: "C" },
            { enabled: true, root: "C", scale: "major" },
        );

        expect(result.hasConflict).toBe(true);
        expect(result.requestedNotes).toEqual(["C4", "D#4", "G4"]);
        expect(result.adaptedNotes).toEqual(["C4", "D4", "G4"]);
        expect(result.changedPitches).toEqual([{ index: 1, requested: "D#4", adapted: "D4" }]);
    });

    it("does not report conflicts when quantization is disabled", () => {
        const result = resolveChordConflict(
            { chordType: "minor", root: "C" },
            { enabled: false, root: "C", scale: "major" },
        );

        expect(result.hasConflict).toBe(false);
        expect(result.adaptedNotes).toEqual(result.requestedNotes);
    });

    it("falls back safely for invalid requests", () => {
        const result = resolveChordConflict(
            { chordType: "unknown", root: "invalid" },
            { enabled: true, root: "C", scale: "major" },
        );

        expect(result.chordName).toBe("Major");
        expect(result.requestedNotes).toEqual(["C4", "E4", "G4"]);
    });
});

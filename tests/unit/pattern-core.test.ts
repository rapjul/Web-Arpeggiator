import { describe, test, expect } from "bun:test";
import {
    parseNoteWithOctave,
    normalizeNoteName,
    normalizeNotesSequence,
    quantizeToScale,
    getArpeggioNotes,
    buildPatternNotesAndMap,
    buildPatternSequence,
    materializePatternSequence,
    calculateNoteMarkers,
    CHROMATIC_PITCHES,
    CHROMATIC_RANGE,
} from "../../js/pattern-core.js";

describe("Pattern Core - Note Parsing & Auto-Resolution", () => {
    test("parseNoteWithOctave parses standard and bare pitch classes", () => {
        expect(parseNoteWithOctave("C4")).toEqual({ name: "C4", midi: 60 });
        expect(parseNoteWithOctave("C")).toEqual({ name: "C4", midi: 60 });
        expect(parseNoteWithOctave("eb")).toEqual({ name: "Eb4", midi: 63 });
        expect(parseNoteWithOctave("f#2")).toEqual({ name: "F#2", midi: 42 });
        expect(parseNoteWithOctave("   g#   ")).toEqual({ name: "G#4", midi: 68 });
        expect(parseNoteWithOctave("invalid")).toBeNull();
        expect(parseNoteWithOctave("")).toBeNull();
    });

    test("normalizeNoteName and normalizeNotesSequence normalize sequences", () => {
        expect(normalizeNoteName("c")).toBe("C4");
        expect(normalizeNoteName("eb3")).toBe("Eb3");
        expect(normalizeNoteName("f#")).toBe("F#4");

        const normalized = normalizeNotesSequence("c4   e   g#4   bb");
        expect(normalized).toEqual(["C4", "E4", "G#4", "Bb4"]);

        const arrayNormalized = normalizeNotesSequence(["c", "d#4", "e", "f5", "g"]);
        expect(arrayNormalized).toEqual(["C4", "D#4", "E4", "F5", "G4"]);
    });

    test("buildPatternNotesAndMap resolves bare notes without dropping them", () => {
        const { notes, map } = buildPatternNotesAndMap(["c", "e", "g"], 1, 0);
        expect(notes).toEqual(["C4", "E4", "G4"]);
        expect(map).toEqual([0, 1, 2]);
    });

    test("quantizeToScale resolves bare notes during quantization", () => {
        const quantized = quantizeToScale(["c", "f#"], "C", "major");
        expect(quantized.length).toBe(2);
        expect(quantized[0]).toBe("C4");
        expect(["F4", "G4"]).toContain(quantized[1]);
    });
});

describe("Pattern Core - Scale Quantization & Octave Expansion", () => {
    test("defines 12 chromatic pitches and 9-octave range", () => {
        expect(CHROMATIC_PITCHES.length).toBe(12);
        expect(CHROMATIC_PITCHES[0]).toBe("C");
        expect(CHROMATIC_PITCHES[CHROMATIC_PITCHES.length - 1]).toBe("B");
        expect(CHROMATIC_RANGE.length).toBe(108); // 9 * 12
        expect(CHROMATIC_RANGE[0]).toBe("C0");
        expect(CHROMATIC_RANGE[CHROMATIC_RANGE.length - 1]).toBe("B8");
    });

    test("quantizeToScale returns original array for empty inputs or chromatic scale", () => {
        expect(quantizeToScale([], "C", "major")).toEqual([]);
        expect(quantizeToScale(["C4", "E4"], "", "major")).toEqual(["C4", "E4"]);
        expect(quantizeToScale(["C4", "E4"], "C", "chromatic")).toEqual(["C4", "E4"]);
    });

    test("quantizes non-scale notes to closest scale degrees in C Major", () => {
        // In C major (C D E F G A B), D#4 (MIDI 63) should snap to D4 (62) or E4 (64)
        const quantized = quantizeToScale(["C4", "D#4", "G#4"], "C", "major");
        expect(quantized.length).toBe(3);
        expect(quantized[0]).toBe("C4");
        // D#4 is 1 semitone from D4 and E4; Tonal matches closest
        expect(["D4", "E4"]).toContain(quantized[1]);
        // G#4 is 1 semitone from G4 and A4
        expect(["G4", "A4"]).toContain(quantized[2]);
    });

    test("quantizes notes to F Minor scale", () => {
        // F Minor: F G Ab Bb C Db Eb
        const quantized = quantizeToScale(["E4", "B4"], "F", "minor");
        expect(quantized.length).toBe(2);
        // E4 (MIDI 64) snaps to Eb4 (63) or F4 (65)
        expect(["Eb4", "F4"]).toContain(quantized[0]);
        // B4 (MIDI 71) snaps to Bb4 (70) or C5 (72)
        expect(["Bb4", "C5"]).toContain(quantized[1]);
    });

    test("getArpeggioNotes expands notes across octave ranges and transpositions", () => {
        const base = ["C4", "E4"];

        // 1 octave, 0 shift
        expect(getArpeggioNotes(base, { octaveRange: 1, octaveShift: 0 })).toEqual(["C4", "E4"]);

        // 2 octaves, 0 shift
        expect(getArpeggioNotes(base, { octaveRange: 2, octaveShift: 0 })).toEqual([
            "C4",
            "C5",
            "E4",
            "E5",
        ]);

        // 1 octave, +1 shift
        expect(getArpeggioNotes(base, { octaveRange: 1, octaveShift: 1 })).toEqual(["C5", "E5"]);

        // 1 octave, -1 shift
        expect(getArpeggioNotes(base, { octaveRange: 1, octaveShift: -1 })).toEqual(["C3", "E3"]);
    });

    test("getArpeggioNotes applies quantization when enabled", () => {
        const base = ["C4", "F#4"];
        const result = getArpeggioNotes(base, {
            octaveRange: 1,
            octaveShift: 0,
            quantize: { enabled: true, root: "C", scale: "major" },
        });
        expect(result[0]).toBe("C4");
        expect(["F4", "G4"]).toContain(result[1]);
    });

    test("buildPatternNotesAndMap tracks original base note indices", () => {
        const base = ["C4", "E4", "G4"];
        const { notes, map } = buildPatternNotesAndMap(base, 2, 0);
        expect(notes).toEqual(["C4", "C5", "E4", "E5", "G4", "G5"]);
        expect(map).toEqual([0, 0, 1, 1, 2, 2]);
    });
});

describe("Pattern Core - All 12 Pattern Directions", () => {
    const base = ["C4", "E4", "G4"];

    test("handles empty base notes gracefully", () => {
        const result = buildPatternSequence([], { direction: "up" });
        expect(result.finalNotes).toEqual([]);
        expect(result.stepToBaseIndexMap).toEqual([]);
    });

    test("builds 'up' and 'down' directions", () => {
        const up = buildPatternSequence(base, { direction: "up" });
        expect(up.finalNotes).toEqual(["C4", "E4", "G4"]);
        expect(up.stepToBaseIndexMap).toEqual([0, 1, 2]);
        expect(up.finalDirection).toBe("up");

        const down = buildPatternSequence(base, { direction: "down" });
        expect(down.finalNotes).toEqual(["C4", "E4", "G4"]);
        expect(down.finalDirection).toBe("down");
    });

    test("builds 'upDownRepeat' and 'downUpRepeat'", () => {
        const upDownRep = buildPatternSequence(base, {
            direction: "upDownRepeat",
        });
        expect(upDownRep.finalNotes).toEqual(["C4", "E4", "G4", "G4", "E4", "C4"]);
        expect(upDownRep.stepToBaseIndexMap).toEqual([0, 1, 2, 2, 1, 0]);
        expect(upDownRep.finalDirection).toBe("up");

        const downUpRep = buildPatternSequence(base, {
            direction: "downUpRepeat",
        });
        expect(downUpRep.finalNotes).toEqual(["G4", "E4", "C4", "C4", "E4", "G4"]);
        expect(downUpRep.stepToBaseIndexMap).toEqual([2, 1, 0, 0, 1, 2]);
        expect(downUpRep.finalDirection).toBe("up");
    });

    test("builds 'octaveCycle' across 3 octaves repeated twice", () => {
        const octCycle = buildPatternSequence(["C4", "G4"], {
            direction: "octaveCycle",
        });
        // C4, C5, C6 (rep 1) + C4, C5, C6 (rep 2) -> 6 notes for C, 6 for G = 12 notes total
        expect(octCycle.finalNotes.length).toBe(12);
        expect(octCycle.finalNotes.slice(0, 6)).toEqual(["C4", "C5", "C6", "C4", "C5", "C6"]);
        expect(octCycle.finalNotes.slice(6, 12)).toEqual(["G4", "G5", "G6", "G4", "G5", "G6"]);
        expect(octCycle.stepToBaseIndexMap.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
        expect(octCycle.stepToBaseIndexMap.slice(6, 12)).toEqual([1, 1, 1, 1, 1, 1]);
    });

    test("builds 'octaveCycleReverse'", () => {
        const octRev = buildPatternSequence(["C4", "G4"], {
            direction: "octaveCycleReverse",
        });
        expect(octRev.finalNotes.length).toBe(12);
        // Reversed base notes: G first, then C. Octaves descending: 6, 5, 4
        expect(octRev.finalNotes.slice(0, 6)).toEqual(["G6", "G5", "G4", "G6", "G5", "G4"]);
        expect(octRev.finalNotes.slice(6, 12)).toEqual(["C6", "C5", "C4", "C6", "C5", "C4"]);
        expect(octRev.stepToBaseIndexMap.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1]);
        expect(octRev.stepToBaseIndexMap.slice(6, 12)).toEqual([0, 0, 0, 0, 0, 0]);
    });

    test("builds 'octaveCyclePingPong'", () => {
        const octPingPong = buildPatternSequence(["C4"], {
            direction: "octaveCyclePingPong",
        });
        // Up: C4, C5, C6; Down: C5, C4; Up: C5, C6 -> 7 notes total
        expect(octPingPong.finalNotes).toEqual(["C4", "C5", "C6", "C5", "C4", "C5", "C6"]);
        expect(octPingPong.stepToBaseIndexMap).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    test("builds 'randomWalkDrunk' with deterministic RNG", () => {
        // Constant RNG mock that selects fixed step offsets
        let callCount = 0;
        const mockRng = () => {
            callCount++;
            return 0.1; // Predictable deterministic path
        };

        const drunk = buildPatternSequence(["C4", "E4", "G4", "B4"], {
            direction: "randomWalkDrunk",
            rng: mockRng,
        });

        expect(drunk.finalNotes.length).toBe(16);
        expect(drunk.stepToBaseIndexMap.length).toBe(16);
        expect(drunk.finalDirection).toBe("up");
    });

    test("builds 'upDown', 'downUp', 'random', and 'randomWalk' directions", () => {
        const upDown = buildPatternSequence(["C4", "E4", "G4"], {
            direction: "upDown",
        });
        expect(upDown.finalDirection).toBe("upDown");
        expect(upDown.finalNotes).toEqual(["C4", "E4", "G4"]);

        const downUp = buildPatternSequence(["C4", "E4", "G4"], {
            direction: "downUp",
        });
        expect(downUp.finalDirection).toBe("downUp");

        const rand = buildPatternSequence(["C4", "E4"], {
            direction: "random",
        });
        expect(rand.finalDirection).toBe("random");

        const randWalk = buildPatternSequence(["C4", "E4"], {
            direction: "randomWalk",
        });
        expect(randWalk.finalDirection).toBe("randomWalk");
    });
});

describe("Pattern Core - Note Marker Calculations", () => {
    test("calculates accurate normalized time ratios for single loops", () => {
        const markers = calculateNoteMarkers({
            baseNotes: ["C4", "E4", "G4", "B4"],
            octaveRange: 1,
            octaveShift: 0,
            direction: "up",
        });

        expect(markers.length).toBe(4);
        expect(markers[0]).toEqual({ note: "C4", timeRatio: 0 });
        expect(markers[1]).toEqual({ note: "E4", timeRatio: 0.25 });
        expect(markers[2]).toEqual({ note: "G4", timeRatio: 0.5 });
        expect(markers[3]).toEqual({ note: "B4", timeRatio: 0.75 });
    });

    test("calculates note markers for down, upDown, and downUp", () => {
        const downMarkers = calculateNoteMarkers({
            baseNotes: ["C4", "E4", "G4"],
            direction: "down",
        });
        expect(downMarkers.map((m) => m.note)).toEqual(["G4", "E4", "C4"]);

        const upDownMarkers = calculateNoteMarkers({
            baseNotes: ["C4", "E4", "G4"],
            direction: "upDown",
        });
        expect(upDownMarkers.map((m) => m.note)).toEqual(["C4", "E4", "G4", "E4"]);

        const downUpMarkers = calculateNoteMarkers({
            baseNotes: ["C4", "E4", "G4"],
            direction: "downUp",
        });
        expect(downUpMarkers.map((m) => m.note)).toEqual(["G4", "E4", "C4", "E4"]);
    });

    test("calculates note markers for upDownRepeat and downUpRepeat", () => {
        const markers = calculateNoteMarkers({
            baseNotes: ["C4", "E4"],
            direction: "upDownRepeat",
        });
        expect(markers.length).toBe(4);
        expect(markers.map((m) => m.note)).toEqual(["C4", "E4", "E4", "C4"]);

        const downUpRepMarkers = calculateNoteMarkers({
            baseNotes: ["C4", "E4"],
            direction: "downUpRepeat",
        });
        expect(downUpRepMarkers.map((m) => m.note)).toEqual(["E4", "C4", "C4", "E4"]);
    });

    test("calculates note markers for octaveCycle and octaveCycleReverse", () => {
        const octCycle = calculateNoteMarkers({
            baseNotes: ["C4"],
            direction: "octaveCycle",
        });
        expect(octCycle.length).toBe(6);
        expect(octCycle.map((m) => m.note)).toEqual(["C4", "C5", "C6", "C4", "C5", "C6"]);

        const octRev = calculateNoteMarkers({
            baseNotes: ["C4"],
            direction: "octaveCycleReverse",
        });
        expect(octRev.length).toBe(6);
        expect(octRev.map((m) => m.note)).toEqual(["C6", "C5", "C4", "C6", "C5", "C4"]);
    });

    test("calculates note markers for octaveCyclePingPong", () => {
        const markers = calculateNoteMarkers({
            baseNotes: ["C4"],
            direction: "octaveCyclePingPong",
        });
        expect(markers.length).toBe(7);
        expect(markers.map((m) => m.note)).toEqual(["C4", "C5", "C6", "C5", "C4", "C5", "C6"]);
    });

    test("applies scale quantization to calculated note markers", () => {
        const markers = calculateNoteMarkers({
            baseNotes: ["C4", "D#4"],
            scaleQuantize: true,
            scaleRoot: "C",
            scaleType: "major",
        });
        expect(markers.length).toBe(2);
        expect(markers[0].note).toBe("C4");
        expect(["D4", "E4"]).toContain(markers[1].note);
    });

    test("returns empty array for empty inputs", () => {
        expect(calculateNoteMarkers({ baseNotes: [] })).toEqual([]);
        expect(calculateNoteMarkers(null as any)).toEqual([]);
    });
});

describe("Pattern Core - materializePatternSequence Deterministic Unrolling", () => {
    const base = ["C4", "E4", "G4"];

    test("materializes 'up' and 'down' sequences", () => {
        const up = materializePatternSequence(base, { direction: "up" });
        expect(up.notes).toEqual(["C4", "E4", "G4"]);
        expect(up.map).toEqual([0, 1, 2]);

        const down = materializePatternSequence(base, { direction: "down" });
        expect(down.notes).toEqual(["G4", "E4", "C4"]);
        expect(down.map).toEqual([2, 1, 0]);
    });

    test("materializes 'upDown' and 'downUp' sequences with exclusive endpoints", () => {
        const upDown = materializePatternSequence(base, { direction: "upDown" });
        expect(upDown.notes).toEqual(["C4", "E4", "G4", "E4"]);
        expect(upDown.map).toEqual([0, 1, 2, 1]);

        const downUp = materializePatternSequence(base, { direction: "downUp" });
        expect(downUp.notes).toEqual(["G4", "E4", "C4", "E4"]);
        expect(downUp.map).toEqual([2, 1, 0, 1]);
    });

    test("materializes 'upDownRepeat' and 'downUpRepeat' with inclusive endpoints", () => {
        const upDownRep = materializePatternSequence(base, {
            direction: "upDownRepeat",
        });
        expect(upDownRep.notes).toEqual(["C4", "E4", "G4", "G4", "E4", "C4"]);
        expect(upDownRep.map).toEqual([0, 1, 2, 2, 1, 0]);

        const downUpRep = materializePatternSequence(base, {
            direction: "downUpRepeat",
        });
        expect(downUpRep.notes).toEqual(["G4", "E4", "C4", "C4", "E4", "G4"]);
        expect(downUpRep.map).toEqual([2, 1, 0, 0, 1, 2]);
    });

    test("materializes octave cycle variants", () => {
        const oct = materializePatternSequence(["C4"], { direction: "octaveCycle" });
        expect(oct.notes).toEqual(["C4", "C5", "C6", "C4", "C5", "C6"]);

        const octRev = materializePatternSequence(["C4"], {
            direction: "octaveCycleReverse",
        });
        expect(octRev.notes).toEqual(["C6", "C5", "C4", "C6", "C5", "C4"]);

        const octPingPong = materializePatternSequence(["C4"], {
            direction: "octaveCyclePingPong",
        });
        expect(octPingPong.notes).toEqual(["C4", "C5", "C6", "C5", "C4", "C5", "C6"]);
    });

    test("materializes random and random walk modes with deterministic RNG", () => {
        const deterministicRng = () => 0.25;

        const rand = materializePatternSequence(base, {
            direction: "random",
            rng: deterministicRng,
        });
        expect(rand.notes.length).toBe(3);

        const walk = materializePatternSequence(base, {
            direction: "randomWalk",
            rng: deterministicRng,
        });
        expect(walk.notes.length).toBe(3);

        const drunk = materializePatternSequence(base, {
            direction: "randomWalkDrunk",
            rng: deterministicRng,
        });
        expect(drunk.notes.length).toBe(16);
    });

    test("exercises randomWalk and randomWalkDrunk branches including negative leap modulo wrapping", () => {
        // 1. Test randomWalk step forward (rng > 0.5) vs step backward (rng <= 0.5)
        let flip = true;
        const alternatingRng = () => {
            flip = !flip;
            return flip ? 0.9 : 0.1;
        };

        const walk = materializePatternSequence(["C4", "E4"], {
            direction: "randomWalk",
            rng: alternatingRng,
        });
        expect(walk.notes.length).toBe(2);
        walk.notes.forEach((n) => expect(["C4", "E4"]).toContain(n));

        // 2. Test randomWalkDrunk leap branch (rng >= 0.8) and negative leap step = -3 with 2 notes
        // Sequence of RNG values:
        // Initial idx: 0 (0.0 * 2 = 0)
        // Step 1: rng() = 0.85 (leap branch >= 0.8), leap rng = 0.0 -> Math.floor(0 * 7) - 3 = -3.
        // With 2 notes, (0 + (-3)) % 2 = -1; normalized modulo must wrap to index 1 (E4), not -1 (undefined).
        const leapRng = (() => {
            const values = [0.0, 0.85, 0.0, 0.85, 0.45, 0.85, 0.0];
            let i = 0;
            return () => values[i++ % values.length];
        })();

        const drunkMaterialized = materializePatternSequence(["C4", "E4"], {
            direction: "randomWalkDrunk",
            rng: leapRng,
        });

        expect(drunkMaterialized.notes.length).toBe(16);
        drunkMaterialized.notes.forEach((note) => {
            expect(note).toBeDefined();
            expect(["C4", "E4"]).toContain(note);
        });

        // 3. Test buildPatternSequence randomWalkDrunk with negative leap modulo
        let stepCount = 0;
        const drunkBuildRng = () => {
            stepCount++;
            // Alternate between leap branch (>= 0.8) and normal step (< 0.8)
            return stepCount % 2 === 0 ? 0.9 : 0.05;
        };
        const drunkBuilt = buildPatternSequence(["C4", "E4"], {
            direction: "randomWalkDrunk",
            rng: drunkBuildRng,
        });
        expect(drunkBuilt.finalNotes.length).toBe(16);
        drunkBuilt.finalNotes.forEach((note) => {
            expect(note).toBeDefined();
            expect(["C4", "E4"]).toContain(note);
        });
    });

    test("exercises all scale quantization modes in getScalePitches", () => {
        const scaleTypes = [
            "major",
            "minor",
            "harmonicMinor",
            "melodicMinor",
            "dorian",
            "phrygian",
            "lydian",
            "mixolydian",
            "locrian",
            "blues",
            "chromatic",
            "unknownScaleFallback",
        ];

        scaleTypes.forEach((scale) => {
            const notes = quantizeToScale(["C4", "D#4", "F#4"], "C", scale);
            expect(notes.length).toBe(3);
            notes.forEach((n) => expect(typeof n).toBe("string"));
        });
    });

    test("handles short baseNotes arrays (<= 2 notes) in upDown and downUp directions", () => {
        const shortUpDown = calculateNoteMarkers({
            baseNotes: ["C4", "E4"],
            direction: "upDown",
        });
        expect(shortUpDown.map((m) => m.note)).toEqual(["C4", "E4"]);

        const shortDownUp = calculateNoteMarkers({
            baseNotes: ["C4", "E4"],
            direction: "downUp",
        });
        expect(shortDownUp.map((m) => m.note)).toEqual(["E4", "C4"]);

        const matShortUpDown = materializePatternSequence(["C4", "E4"], {
            direction: "upDown",
        });
        expect(matShortUpDown.notes).toEqual(["C4", "E4"]);

        const matShortDownUp = materializePatternSequence(["C4", "E4"], {
            direction: "downUp",
        });
        expect(matShortDownUp.notes).toEqual(["E4", "C4"]);
    });

    test("handles fallback/unrecognized direction branches gracefully", () => {
        // @ts-expect-error test unrecognized direction
        const matFallback = materializePatternSequence(["C4", "E4"], { direction: "invalid" });
        expect(matFallback.notes).toEqual(["C4", "E4"]);

        // @ts-expect-error test unrecognized direction in marker calculation
        const markerFallback = calculateNoteMarkers({
            baseNotes: ["C4", "E4"],
            direction: "unknown",
        });
        expect(markerFallback.map((m) => m.note)).toEqual(["C4", "E4"]);
    });

    test("handles empty or invalid inputs gracefully", () => {
        expect(materializePatternSequence([])).toEqual({ notes: [], map: [] });
        expect(materializePatternSequence(null as any)).toEqual({ notes: [], map: [] });
    });
});

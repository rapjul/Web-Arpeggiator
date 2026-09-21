import { describe, expect, it } from "vitest";
import { DEFAULT_RANDOM_SEED, MAX_RANDOM_SEED, normalizeRandomSeed } from "@core/random-seed.js";

describe("random seed normalization", () => {
    it("defaults missing and nonnumeric settings while preserving valid unsigned seeds", () => {
        for (const value of [null, undefined, "", "   ", true, false, Number.NaN, Infinity]) {
            expect(normalizeRandomSeed(value)).toBe(DEFAULT_RANDOM_SEED);
        }

        expect(normalizeRandomSeed("42")).toBe(42);
        expect(normalizeRandomSeed(-1)).toBe(0);
        expect(normalizeRandomSeed(MAX_RANDOM_SEED + 1)).toBe(MAX_RANDOM_SEED);
        expect(normalizeRandomSeed(null, 7)).toBe(7);
    });
});

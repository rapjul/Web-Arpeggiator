/** Stable seed used by legacy settings that predate reproducible patterns. */
export const DEFAULT_RANDOM_SEED = 0x6d2b79f5;
export const MAX_RANDOM_SEED = 0xffffffff;

/** @param {unknown} value @param {number} [fallback=DEFAULT_RANDOM_SEED] */
export function normalizeRandomSeed(value, fallback = DEFAULT_RANDOM_SEED) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return normalizeRandomSeed(fallback, DEFAULT_RANDOM_SEED);
    return Math.min(Math.max(Math.trunc(parsed), 0), MAX_RANDOM_SEED) >>> 0;
}

/** Creates a compact deterministic 32-bit pseudo-random number generator. */
export function createSeededRandom(seed = DEFAULT_RANDOM_SEED) {
    let state = normalizeRandomSeed(seed);
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

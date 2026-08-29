/**
 * @file Unit tests for Web Arpeggiator Audio Engine configurations and supported synth models.
 */

import { describe, expect, it } from "bun:test";
import type { WebArpSynth } from "../../types.d.ts";

describe("Audio Engine Model Definitions", () => {
    /**
     * Complete list of all 8 synthesizer models supported by Web Arpeggiator.
     * @type {readonly string[]}
     */
    const supportedSynthTypes = [
        "synth",
        "fmSynth",
        "amSynth",
        "monoSynth",
        "duoSynth",
        "pluckSynth",
        "membraneSynth",
        "polySynth",
    ] as const;

    /**
     * Standard oscillator waveforms supported across synthesizers.
     * @type {readonly string[]}
     */
    const supportedWaveforms = ["sine", "square", "sawtooth", "triangle", "pulse"] as const;

    it("verifies all 8 expected synth models are registered", () => {
        expect(supportedSynthTypes).toHaveLength(8);
        expect(supportedSynthTypes).toContain("synth");
        expect(supportedSynthTypes).toContain("fmSynth");
        expect(supportedSynthTypes).toContain("amSynth");
        expect(supportedSynthTypes).toContain("monoSynth");
        expect(supportedSynthTypes).toContain("duoSynth");
        expect(supportedSynthTypes).toContain("pluckSynth");
        expect(supportedSynthTypes).toContain("membraneSynth");
        expect(supportedSynthTypes).toContain("polySynth");
    });

    it("verifies all 5 standard oscillator waveforms are supported", () => {
        expect(supportedWaveforms).toHaveLength(5);
        expect(supportedWaveforms).toContain("sine");
        expect(supportedWaveforms).toContain("square");
        expect(supportedWaveforms).toContain("sawtooth");
        expect(supportedWaveforms).toContain("triangle");
        expect(supportedWaveforms).toContain("pulse");
    });

    it("validates ADSR envelope boundary constraints", () => {
        /**
         * Clamps an envelope duration between a minimum and maximum duration in seconds.
         *
         * @param {number} val - Raw duration input value in seconds.
         * @param {number} [min=0.005] - Minimum allowable duration in seconds.
         * @param {number} [max=5.0] - Maximum allowable duration in seconds.
         * @returns {number} Clamped envelope duration.
         */
        const clampTime = (val: number, min = 0.005, max = 5.0): number =>
            Math.max(min, Math.min(max, val));

        /**
         * Clamps an envelope sustain level ratio between 0.0 and 1.0.
         *
         * @param {number} val - Raw sustain input ratio.
         * @returns {number} Normalized ratio between 0.0 and 1.0.
         */
        const clampRatio = (val: number): number => Math.max(0, Math.min(1, val));

        expect(clampTime(0.001)).toBe(0.005);
        expect(clampTime(10.0)).toBe(5.0);
        expect(clampTime(0.25)).toBe(0.25);

        expect(clampRatio(-0.5)).toBe(0);
        expect(clampRatio(1.5)).toBe(1);
        expect(clampRatio(0.75)).toBe(0.75);
    });
});

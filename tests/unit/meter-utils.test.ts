/**
 * @file Unit tests for audio metering, decibel scaling, and smoothing algorithms.
 */

import { describe, expect, it } from "vitest";
import { amplitudeToDb, dbToPercent, percentToDb, smoothMeterLevel } from "@core/meter-utils.js";

describe("Meter Utils Domain Module", () => {
    describe("dbToPercent", () => {
        it("converts default bounds (-40 dB to 0 dB) accurately", () => {
            expect(dbToPercent(0)).toBe(100);
            expect(dbToPercent(-40)).toBe(0);
            expect(dbToPercent(-20)).toBe(50);
            expect(dbToPercent(-10)).toBe(75);
        });

        it("clamps values outside range bounds", () => {
            expect(dbToPercent(10)).toBe(100);
            expect(dbToPercent(-100)).toBe(0);
        });

        it("supports custom min and max decibel boundaries", () => {
            expect(dbToPercent(-30, -60, 0)).toBe(50);
            expect(dbToPercent(-60, -60, 0)).toBe(0);
            expect(dbToPercent(0, -60, 0)).toBe(100);
        });

        it("safely handles non-finite or invalid bounds", () => {
            expect(dbToPercent(NaN)).toBe(0);
            expect(dbToPercent(Infinity)).toBe(0);
            expect(dbToPercent(-10, NaN, 0)).toBe(0);
            expect(dbToPercent(-10, -40, NaN)).toBe(0);
            expect(dbToPercent(-10, 0, -40)).toBe(0); // minDb >= maxDb
        });
    });

    describe("percentToDb", () => {
        it("converts 0–100 percentage values back to decibels", () => {
            expect(percentToDb(100)).toBe(0);
            expect(percentToDb(0)).toBe(-40);
            expect(percentToDb(50)).toBe(-20);
        });

        it("clamps out-of-bound percentages", () => {
            expect(percentToDb(-20)).toBe(-40);
            expect(percentToDb(150)).toBe(0);
        });

        it("safely handles non-finite percentage inputs", () => {
            expect(percentToDb(NaN)).toBe(-40);
            expect(percentToDb(Infinity)).toBe(-40);
        });
    });

    describe("amplitudeToDb", () => {
        it("converts positive linear amplitude values to decibels", () => {
            expect(amplitudeToDb(1.0)).toBeCloseTo(0, 5);
            expect(amplitudeToDb(0.1)).toBeCloseTo(-20, 5);
            expect(amplitudeToDb(0.01)).toBeCloseTo(-40, 5);
        });

        it("returns -Infinity for zero, negative, or invalid amplitudes", () => {
            expect(amplitudeToDb(0)).toBe(-Infinity);
            expect(amplitudeToDb(-0.5)).toBe(-Infinity);
            expect(amplitudeToDb(NaN)).toBe(-Infinity);
            expect(amplitudeToDb(Infinity)).toBe(-Infinity);
        });
    });

    describe("smoothMeterLevel", () => {
        it("calculates exponential moving average correctly", () => {
            // current = 0.0, target = 1.0, smoothing = 0.8 -> 0 * 0.8 + 1 * 0.2 = 0.2
            expect(smoothMeterLevel(0.0, 1.0, 0.8)).toBeCloseTo(0.2, 5);
            // current = 0.5, target = 0.5 -> 0.5
            expect(smoothMeterLevel(0.5, 0.5, 0.8)).toBeCloseTo(0.5, 5);
        });

        it("handles instantaneous smoothing factor (0.0) and frozen factor (1.0)", () => {
            expect(smoothMeterLevel(0.2, 1.0, 0.0)).toBeCloseTo(1.0, 5);
            expect(smoothMeterLevel(0.2, 1.0, 1.0)).toBeCloseTo(0.2, 5);
        });

        it("clamps smoothing factors outside 0.0 to 1.0", () => {
            expect(smoothMeterLevel(0.2, 1.0, -0.5)).toBeCloseTo(1.0, 5);
            expect(smoothMeterLevel(0.2, 1.0, 1.5)).toBeCloseTo(0.2, 5);
        });

        it("returns 0 for non-finite level parameters", () => {
            expect(smoothMeterLevel(NaN, 1.0)).toBe(0);
            expect(smoothMeterLevel(0.5, NaN)).toBe(0);
        });
    });
});

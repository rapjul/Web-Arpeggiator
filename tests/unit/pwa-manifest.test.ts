/**
 * @file Unit tests for PWA asset manifest and standalone SVG asset integrity.
 */

import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

describe("PWA Asset Manifest & SVG Integrity", () => {
    const root = path.resolve(import.meta.dir, "../../public/images");

    it("verifies all 12 pattern direction SVG files exist with unique IDs", () => {
        const patternsDir = path.join(root, "patterns");
        expect(fs.existsSync(patternsDir)).toBe(true);

        const expectedPatterns = [
            "pattern-direction-up.svg",
            "pattern-direction-down.svg",
            "pattern-direction-upDown.svg",
            "pattern-direction-downUp.svg",
            "pattern-direction-upDownRepeated.svg",
            "pattern-direction-downUpRepeated.svg",
            "pattern-direction-random.svg",
            "pattern-direction-octaveCycle.svg",
            "pattern-direction-octaveCycleReversed.svg",
            "pattern-direction-octaveCyclePingPong.svg",
            "pattern-direction-randomWalk.svg",
            "pattern-direction-randomWalkDrunkard.svg",
        ];

        const seenIds = new Set<string>();

        for (const file of expectedPatterns) {
            const filePath = path.join(patternsDir, file);
            expect(fs.existsSync(filePath)).toBe(true);

            const content = fs.readFileSync(filePath, "utf8");
            expect(content).toContain("<svg");
            expect(content).toContain("</svg>");

            const match = content.match(/id="([^"]+)"/);
            expect(match).not.toBeNull();
            if (match) {
                const id = match[1];
                expect(seenIds.has(id)).toBe(false);
                seenIds.add(id);
            }
        }
    });

    it("verifies all 5 waveform SVG files exist with unique IDs", () => {
        const waveformsDir = path.join(root, "waveforms");
        expect(fs.existsSync(waveformsDir)).toBe(true);

        const expectedWaveforms = [
            "waveform-sine.svg",
            "waveform-sawtooth.svg",
            "waveform-triangle.svg",
            "waveform-square.svg",
            "waveform-pulse.svg",
        ];

        const seenIds = new Set<string>();

        for (const file of expectedWaveforms) {
            const filePath = path.join(waveformsDir, file);
            expect(fs.existsSync(filePath)).toBe(true);

            const content = fs.readFileSync(filePath, "utf8");
            expect(content).toContain("<svg");
            expect(content).toContain("</svg>");

            const match = content.match(/id="([^"]+)"/);
            expect(match).not.toBeNull();
            if (match) {
                const id = match[1];
                expect(seenIds.has(id)).toBe(false);
                seenIds.add(id);
            }
        }
    });

    it("verifies all UI icon SVG files exist with unique IDs", () => {
        const iconsDir = path.join(root, "icons");
        expect(fs.existsSync(iconsDir)).toBe(true);

        const expectedIcons = [
            "icon-output-info.svg",
            "icon-string-model.svg",
            "icon-preset-mgmt.svg",
            "icon-storage-database.svg",
            "icon-file-transfer.svg",
            "icon-share-link.svg",
            "icon-copy-link.svg",
        ];

        const seenIds = new Set<string>();

        for (const file of expectedIcons) {
            const filePath = path.join(iconsDir, file);
            expect(fs.existsSync(filePath)).toBe(true);

            const content = fs.readFileSync(filePath, "utf8");
            expect(content).toContain("<svg");
            expect(content).toContain("</svg>");

            const match = content.match(/id="([^"]+)"/);
            expect(match).not.toBeNull();
            if (match) {
                const id = match[1];
                expect(seenIds.has(id)).toBe(false);
                seenIds.add(id);
            }
        }
    });
});

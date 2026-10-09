/**
 * @file Unit tests for PWA asset manifest and standalone SVG asset integrity.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

describe("PWA Asset Manifest & SVG Integrity", () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(currentDir, "../../public/images");

    it("verifies all 13 pattern direction SVG files exist with unique IDs", () => {
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
            "pattern-direction-randomCycle.svg",
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

    it("keeps every PWA manifest icon and screenshot source asset", () => {
        const expectedAssets = [
            "icons/pwa-icon.svg",
            "icons/pwa-icon-192.png",
            "icons/pwa-icon-512.png",
            "icons/pwa-icon-maskable.svg",
            "icons/pwa-icon-maskable-192.png",
            "icons/pwa-icon-maskable-512.png",
            "screenshots/desktop.png",
            "screenshots/mobile.png",
        ];

        for (const asset of expectedAssets) {
            expect(fs.existsSync(path.join(root, asset))).toBe(true);
        }
    });

    it("verifies mobile viewport and Apple PWA configuration in index.html", () => {
        const indexPath = path.resolve(currentDir, "../../index.html");
        expect(fs.existsSync(indexPath)).toBe(true);
        const indexHtml = fs.readFileSync(indexPath, "utf8");

        // Viewport metadata with cover fit for WebKit safe-area support
        expect(indexHtml).toMatch(
            /<meta[^>]+name="viewport"[^>]+content="[^"]*viewport-fit=cover[^"]*"/,
        );

        // Apple standalone PWA configuration
        expect(indexHtml).toMatch(
            /<meta[^>]+name="apple-mobile-web-app-capable"[^>]+content="yes"/,
        );
        expect(indexHtml).toMatch(
            /<meta[^>]+name="apple-mobile-web-app-status-bar-style"[^>]+content="black-translucent"/,
        );
        expect(indexHtml).toMatch(
            /<meta[^>]+name="apple-mobile-web-app-title"[^>]+content="Web Arpeggiator"/,
        );

        // Dynamic viewport height units for mobile browser toolbars
        expect(indexHtml).toContain("min-h-[100dvh]");
        expect(indexHtml).toContain("max-h-[90dvh]");
    });

    it("verifies mobile safe-area insets, touch-action, and overscroll styles", () => {
        const baseCssPath = path.resolve(currentDir, "../../styles/base.css");
        const keyboardCssPath = path.resolve(currentDir, "../../styles/keyboard.css");
        const componentsCssPath = path.resolve(currentDir, "../../styles/components.css");
        const featuresCssPath = path.resolve(currentDir, "../../styles/features.css");
        expect(fs.existsSync(baseCssPath)).toBe(true);
        expect(fs.existsSync(keyboardCssPath)).toBe(true);
        expect(fs.existsSync(componentsCssPath)).toBe(true);
        expect(fs.existsSync(featuresCssPath)).toBe(true);

        const baseCss = fs.readFileSync(baseCssPath, "utf8");
        const keyboardCss = fs.readFileSync(keyboardCssPath, "utf8");
        const componentsCss = fs.readFileSync(componentsCssPath, "utf8");
        const featuresCss = fs.readFileSync(featuresCssPath, "utf8");

        // Safe-area insets on body across portrait and landscape viewports
        expect(baseCss).toContain(
            "padding-top: max(0.5rem, calc(0.5rem + env(safe-area-inset-top, 0px)));",
        );
        expect(baseCss).toContain(
            "padding-left: max(0.5rem, calc(0.5rem + env(safe-area-inset-left, 0px)));",
        );
        expect(baseCss).toContain(
            "padding-right: max(0.5rem, calc(0.5rem + env(safe-area-inset-right, 0px)));",
        );
        expect(baseCss).toContain(
            "padding-top: max(1rem, calc(0.5rem + env(safe-area-inset-top, 0px)));",
        );
        expect(baseCss).toContain(
            "padding-left: max(1rem, calc(0.5rem + env(safe-area-inset-left, 0px)));",
        );
        expect(baseCss).toContain(
            "padding-right: max(1rem, calc(0.5rem + env(safe-area-inset-right, 0px)));",
        );

        // Toast container safe-area clearance at desktop/landscape widths
        expect(componentsCss).toContain(
            "bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));",
        );
        expect(componentsCss).toContain("right: calc(1.25rem + env(safe-area-inset-right, 0px));");

        // Sticky transport bar lateral safe-area padding
        expect(featuresCss).toContain("padding-left: calc(1rem + env(safe-area-inset-left, 0px));");
        expect(featuresCss).toContain(
            "padding-right: calc(1rem + env(safe-area-inset-right, 0px));",
        );

        // Overscroll bounce prevention and transparent tap highlight
        expect(baseCss).toContain("overscroll-behavior-y: none;");
        expect(baseCss).toContain("-webkit-tap-highlight-color: transparent;");

        // Suppressed double-tap zoom delay on piano keys
        expect(keyboardCss).toMatch(/\.piano-key\s*\{[^}]*touch-action:\s*none;/);
    });
});

/**
 * @file Unit tests verifying production HTML DOM parity for pattern direction controls.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockPatternInstance {
    values: string[];
    pattern: string;
    interval: string;
    isStarted: boolean;
    isDisposed: boolean;
    callback: (time: number, note: string) => void;
    start: () => void;
    dispose: () => void;
}

interface WebArpeggiatorWindow extends Window {
    currentOctaveRange?: number;
    currentOctaveShift?: number;
    isPlaying?: boolean;
    arpPattern?: MockPatternInstance | null;
}

vi.mock("tone", async (importOriginal) => {
    const actual = await importOriginal<typeof import("tone")>();
    class MockPattern implements MockPatternInstance {
        values: string[];
        pattern: string;
        interval = "16n";
        isStarted = false;
        isDisposed = false;
        callback: (time: number, note: string) => void;

        constructor(
            callback: (time: number, note: string) => void,
            values: string[],
            pattern: string,
        ) {
            this.callback = callback;
            this.values = values;
            this.pattern = pattern;
        }

        start() {
            this.isStarted = true;
        }

        dispose() {
            this.isDisposed = true;
        }
    }

    return {
        ...actual,
        Pattern: MockPattern,
        Draw: {
            schedule: (fn: () => void) => fn(),
        },
    };
});

import { createOrUpdatePattern } from "@audio/pattern-generator.js";

describe("Production DOM Parity Suite", () => {
    const appWindow = window as unknown as WebArpeggiatorWindow;
    let htmlContent: string;

    beforeEach(() => {
        const htmlPath = resolve(__dirname, "../../index.html");
        htmlContent = readFileSync(htmlPath, "utf-8");
        // Extract only <body> content to avoid <head> stylesheet network fetch requests in HappyDOM
        const bodyStart = htmlContent.indexOf("<body");
        const bodyEnd = htmlContent.indexOf("</body>");
        const bodyHtml =
            bodyStart !== -1 && bodyEnd !== -1
                ? htmlContent.slice(bodyStart, bodyEnd + 7)
                : htmlContent;

        const parser = new DOMParser();
        const doc = parser.parseFromString(bodyHtml, "text/html");
        doc.querySelectorAll("script").forEach((element) => {
            element.remove();
        });
        document.body.innerHTML = doc.body.innerHTML;

        appWindow.currentOctaveRange = 1;
        appWindow.currentOctaveShift = 0;
        appWindow.isPlaying = false;
    });

    afterEach(() => {
        if (appWindow.arpPattern) {
            try {
                appWindow.arpPattern.dispose();
            } catch {}
            appWindow.arpPattern = null;
        }
        document.body.innerHTML = "";
    });

    it("verifies index.html contains all 12 pattern direction radio inputs and matching spans", () => {
        const patternButtons = document.getElementById("pattern-buttons");
        expect(patternButtons).not.toBeNull();

        const expectedDirections = [
            "up",
            "down",
            "upDown",
            "downUp",
            "upDownRepeat",
            "downUpRepeat",
            "random",
            "octaveCycle",
            "octaveCycleReverse",
            "octaveCyclePingPong",
            "randomWalk",
            "randomWalkDrunk",
        ];

        const radios = patternButtons?.querySelectorAll<HTMLInputElement>(
            "input[name='pattern-direction']",
        );
        expect(radios?.length).toBe(12);

        const radioValues = Array.from(radios || []).map((r) => r.value);
        expect(radioValues).toEqual(expectedDirections);

        for (const dir of expectedDirections) {
            const span = patternButtons?.querySelector(`.pattern-btn[data-pattern="${dir}"]`);
            expect(span).not.toBeNull();
        }
    });

    it("correctly generates Tone.Pattern for each pattern direction directly from index.html DOM", () => {
        const expectedDirections = [
            { dir: "up", expectedPattern: "up" },
            { dir: "down", expectedPattern: "down" },
            { dir: "upDown", expectedPattern: "upDown" },
            { dir: "downUp", expectedPattern: "downUp" },
            { dir: "upDownRepeat", expectedPattern: "up" },
            { dir: "downUpRepeat", expectedPattern: "up" },
            { dir: "random", expectedPattern: "random" },
            { dir: "octaveCycle", expectedPattern: "up" },
            { dir: "octaveCycleReverse", expectedPattern: "up" },
            { dir: "octaveCyclePingPong", expectedPattern: "up" },
            { dir: "randomWalk", expectedPattern: "randomWalk" },
            { dir: "randomWalkDrunk", expectedPattern: "up" },
        ];

        const radios = document.querySelectorAll<HTMLInputElement>(
            "input[name='pattern-direction']",
        );

        for (const { dir, expectedPattern } of expectedDirections) {
            // Uncheck all radios
            radios.forEach((r) => {
                r.checked = false;
            });

            // Check matching radio
            const targetRadio = document.querySelector<HTMLInputElement>(
                `input[name='pattern-direction'][value="${dir}"]`,
            );
            expect(targetRadio).not.toBeNull();
            if (targetRadio) {
                targetRadio.checked = true;
            }

            createOrUpdatePattern();

            const pattern = appWindow.arpPattern;
            expect(pattern).toBeDefined();
            expect(pattern?.pattern).toBe(expectedPattern);
            expect(pattern?.values.length).toBeGreaterThan(0);
        }
    });
});

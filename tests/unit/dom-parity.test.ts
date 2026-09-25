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

import { createPatternController } from "@audio/pattern-generator.js";
import { ALLOWED_DIRECTIONS } from "@core/settings-contract.js";
import { CHORD_DEFINITIONS } from "@core/chord-builder.js";

describe("Production DOM Parity Suite", () => {
    let htmlContent: string;

    function updatePattern() {
        const direction =
            document.querySelector<HTMLInputElement>("input[name='pattern-direction']:checked")
                ?.value || "up";
        const controller = createPatternController({
            getSynth: () => null,
            getIsPlaying: () => false,
            onPatternChange: () => {},
        });
        return controller.update({
            baseNotes: document.getElementById("notes")?.getAttribute("value")?.split(/\s+/) || [],
            octaveRange: 1,
            octaveShift: 0,
            interval: "16n",
            gate: 0.8,
            direction,
            quantize: { enabled: false, root: "C", scale: "major" },
        }) as unknown as MockPatternInstance | null;
    }

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
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("verifies index.html contains all 13 pattern direction radio inputs and matching spans", () => {
        const patternButtons = document.getElementById("pattern-buttons");
        expect(patternButtons).not.toBeNull();

        const radios = patternButtons?.querySelectorAll<HTMLInputElement>(
            "input[name='pattern-direction']",
        );
        expect(radios?.length).toBe(13);

        const radioValues = Array.from(radios || []).map((r) => r.value);
        expect(radioValues).toEqual(ALLOWED_DIRECTIONS);

        for (const dir of ALLOWED_DIRECTIONS) {
            const span = patternButtons?.querySelector(`.pattern-btn[data-pattern="${dir}"]`);
            expect(span).not.toBeNull();
        }
    });

    it("materializes every DOM pattern direction into a timeline-backed Tone.Pattern", () => {
        const radios = document.querySelectorAll<HTMLInputElement>(
            "input[name='pattern-direction']",
        );

        for (const dir of ALLOWED_DIRECTIONS) {
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

            const pattern = updatePattern();
            expect(pattern).toBeDefined();
            expect(pattern?.pattern).toBe("up");
            expect(pattern?.values.length).toBeGreaterThan(0);
        }
    });

    it("verifies index.html contains all 6 chord starter buttons with appropriate data-chord attributes", () => {
        const chordButtonsContainer = document.getElementById("chord-buttons");
        expect(chordButtonsContainer).not.toBeNull();

        const expectedChords = Object.keys(CHORD_DEFINITIONS);
        const buttons = chordButtonsContainer?.querySelectorAll<HTMLButtonElement>(".chord-btn");
        expect(buttons?.length).toBe(6);

        const chordTypes = Array.from(buttons || []).map((b) => b.getAttribute("data-chord"));
        expect(chordTypes).toEqual(expectedChords);
    });

    it("describes the chord conflict decision and shared scale-root control", () => {
        const dialog = document.getElementById("chord-conflict-dialog");
        const descriptionId = dialog?.getAttribute("aria-describedby");
        const description = descriptionId ? document.getElementById(descriptionId) : null;
        const rootSelect = document.getElementById("scale-root");
        const rootHelpId = rootSelect?.getAttribute("aria-describedby");
        const rootHelp = rootHelpId ? document.getElementById(rootHelpId) : null;

        expect(description?.textContent).toContain("turns scale snapping off");
        expect(description?.textContent).toContain("Adapt keeps scale snapping on");
        expect(rootHelp?.textContent).toContain("scale snapping and chord starters");
    });

    it("provides accessible seamless and effects-tail offline export controls", () => {
        const bpm = document.getElementById("bpm") as HTMLInputElement | null;
        expect(bpm?.min).toBe("40");
        expect(bpm?.max).toBe("240");
        const exportModeInputs = document.querySelectorAll<HTMLInputElement>(
            "input[name='offline-export-mode']",
        );
        const tailInput = document.getElementById(
            "offline-export-tail-seconds",
        ) as HTMLInputElement | null;
        const tailMode = document.getElementById(
            "offline-export-tail-mode",
        ) as HTMLSelectElement | null;
        const duration = document.getElementById("offline-export-duration");

        expect(document.getElementById("offline-export-title")?.textContent).not.toContain(
            "Perfect Loop",
        );
        expect(Array.from(exportModeInputs).map((input) => input.value)).toEqual([
            "seamless",
            "tail",
        ]);
        expect(exportModeInputs[1].checked).toBe(true);
        expect(tailInput?.min).toBe("0");
        expect(tailInput?.max).toBe("10");
        expect(tailInput?.step).toBe("0.1");
        expect(tailInput?.value).toBe("2");
        expect(tailMode?.value).toBe("auto");
        expect(tailMode?.querySelectorAll("option")).toHaveLength(2);
        expect(duration?.getAttribute("aria-live")).toBe("polite");
    });

    it("masks the app until interface mode restoration and hides the complete Utilities card", () => {
        const appMain = document.getElementById("app-main");
        const utilitiesTitle = document.getElementById("utilities-title");
        const utilitiesSection = utilitiesTitle?.closest("section");
        const visualizerContent = document
            .getElementById("visualizer-container")
            ?.closest(".space-y-4");

        expect(appMain?.hidden).toBe(true);
        expect(utilitiesSection?.hasAttribute("data-interface-advanced")).toBe(true);
        expect(visualizerContent?.hasAttribute("data-interface-advanced")).toBe(false);
    });

    it("verifies synth types and waveforms have descriptive sound character labels and custom tooltips", () => {
        const synthSelect = document.getElementById("synth-type") as HTMLSelectElement;
        expect(synthSelect).not.toBeNull();

        const options = Array.from(synthSelect.options).map((o) => o.text);
        expect(options.some((t) => t.includes("Basic Synth — Clean, versatile"))).toBe(true);
        expect(options.some((t) => t.includes("FM Synth — Bells, metallic, digital"))).toBe(true);

        const waveformButtons = document.querySelectorAll<HTMLButtonElement>(
            "#waveform-buttons .waveform-btn",
        );
        expect(waveformButtons.length).toBe(5);
        for (const btn of waveformButtons) {
            expect(btn.classList.contains("has-custom-tooltip")).toBe(true);
            expect(btn.getAttribute("data-tooltip")).toBeTruthy();
            expect(btn.getAttribute("aria-label")).toBeTruthy();
        }

        const patternRadios = document.querySelectorAll<HTMLInputElement>(
            '#pattern-buttons input[type="radio"]',
        );
        expect(patternRadios.length).toBe(13);
        for (const radio of patternRadios) {
            expect(radio.getAttribute("aria-label")).toBeTruthy();
        }

        const patternButtons = document.querySelectorAll<HTMLElement>(
            "#pattern-buttons .pattern-btn",
        );
        expect(patternButtons.length).toBe(13);
        for (const btn of patternButtons) {
            expect(btn.classList.contains("has-custom-tooltip")).toBe(true);
            expect(btn.getAttribute("data-tooltip")).toBeTruthy();
        }

        const chordButtons = document.querySelectorAll<HTMLButtonElement>(
            "#chord-buttons .chord-btn",
        );
        expect(chordButtons.length).toBe(6);
        for (const btn of chordButtons) {
            expect(btn.classList.contains("has-custom-tooltip")).toBe(true);
            expect(btn.getAttribute("data-tooltip")).toBeTruthy();
            expect(btn.getAttribute("aria-label")).toBeTruthy();
        }

        const reshuffleButton = document.getElementById(
            "reshuffle-pattern",
        ) as HTMLButtonElement | null;
        expect(reshuffleButton).not.toBeNull();
        expect(reshuffleButton?.getAttribute("aria-label")).toContain("Reshuffle Pattern");
    });
});

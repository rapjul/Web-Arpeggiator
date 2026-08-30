/**
 * @file Unit tests for Pattern Generator scheduling, duration calculations, and DOM integration.
 */

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
    activeSynth?: {
        triggerAttack?: ReturnType<typeof vi.fn>;
        triggerRelease?: ReturnType<typeof vi.fn>;
        triggerAttackRelease?: ReturnType<typeof vi.fn>;
    } | null;
    arpPattern?: MockPatternInstance | null;
    __WEB_ARP_STEP_HIGHLIGHT__?: ReturnType<typeof vi.fn>;
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

describe("Pattern Generator Module", () => {
    const appWindow = window as unknown as WebArpeggiatorWindow;
    let container: HTMLElement;
    let notesInput: HTMLInputElement;
    let intervalSelect: HTMLSelectElement;
    let gateSlider: HTMLInputElement;
    let patternButtons: HTMLElement;
    let scaleQuantizeToggle: HTMLInputElement;
    let scaleRootSelect: HTMLSelectElement;
    let scaleTypeSelect: HTMLSelectElement;

    beforeEach(() => {
        container = document.createElement("div");

        notesInput = document.createElement("input");
        notesInput.id = "notes";
        notesInput.value = "C4 E4 G4";

        intervalSelect = document.createElement("select");
        intervalSelect.id = "interval";
        intervalSelect.innerHTML =
            "<option value='16n' selected>16n</option><option value='8n'>8n</option>";

        gateSlider = document.createElement("input");
        gateSlider.id = "gate";
        gateSlider.value = "0.75";

        patternButtons = document.createElement("div");
        patternButtons.id = "pattern-buttons";
        const upBtn = document.createElement("button");
        upBtn.className = "selected";
        upBtn.setAttribute("data-pattern", "up");
        patternButtons.appendChild(upBtn);

        scaleQuantizeToggle = document.createElement("input");
        scaleQuantizeToggle.id = "scale-quantize-toggle";
        scaleQuantizeToggle.type = "checkbox";
        scaleQuantizeToggle.checked = false;

        scaleRootSelect = document.createElement("select");
        scaleRootSelect.id = "scale-root";
        scaleRootSelect.innerHTML = "<option value='C' selected>C</option>";

        scaleTypeSelect = document.createElement("select");
        scaleTypeSelect.id = "scale-type";
        scaleTypeSelect.innerHTML = "<option value='major' selected>major</option>";

        container.appendChild(notesInput);
        container.appendChild(intervalSelect);
        container.appendChild(gateSlider);
        container.appendChild(patternButtons);
        container.appendChild(scaleQuantizeToggle);
        container.appendChild(scaleRootSelect);
        container.appendChild(scaleTypeSelect);
        document.body.appendChild(container);

        appWindow.currentOctaveRange = 1;
        appWindow.currentOctaveShift = 0;
        appWindow.isPlaying = false;
        appWindow.activeSynth = null;
    });

    afterEach(() => {
        if (appWindow.arpPattern) {
            try {
                appWindow.arpPattern.dispose();
            } catch {}
            appWindow.arpPattern = null;
        }
        delete appWindow.__WEB_ARP_STEP_HIGHLIGHT__;
        document.body.innerHTML = "";
    });

    it("creates a Tone.Pattern instance when notes are provided", () => {
        createOrUpdatePattern();

        const pattern = appWindow.arpPattern;
        expect(pattern).toBeDefined();
        expect(pattern?.values).toEqual(["C4", "E4", "G4"]);
        expect(pattern?.interval).toBe("16n");
    });

    it("executes the pattern scheduling callback to trigger note attacks and step highlights", () => {
        const mockSynth = {
            triggerAttack: vi.fn(),
            triggerRelease: vi.fn(),
        };
        const mockHighlight = vi.fn();

        appWindow.activeSynth = mockSynth;
        appWindow.__WEB_ARP_STEP_HIGHLIGHT__ = mockHighlight;
        appWindow.isPlaying = true;

        createOrUpdatePattern();

        const pattern = appWindow.arpPattern;
        expect(pattern).toBeDefined();
        expect(pattern?.isStarted).toBe(true);

        // Execute scheduled step
        pattern?.callback(0.25, "C4");
        expect(mockSynth.triggerAttack).toHaveBeenCalledWith("C4", 0.25);
        expect(mockSynth.triggerRelease).toHaveBeenCalled();
        expect(mockHighlight).toHaveBeenCalled();
    });

    it("triggers synth with triggerAttackRelease when triggerAttack is not available", () => {
        const mockSynth = {
            triggerAttackRelease: vi.fn(),
        };

        appWindow.activeSynth = mockSynth;
        createOrUpdatePattern();

        const pattern = appWindow.arpPattern;
        pattern?.callback(0.5, "E4");
        expect(mockSynth.triggerAttackRelease).toHaveBeenCalledWith("E4", expect.any(Number), 0.5);
    });

    it("applies octave shifts and scale quantization from DOM controls", () => {
        appWindow.currentOctaveRange = 2;
        appWindow.currentOctaveShift = 1;
        scaleQuantizeToggle.checked = true;

        createOrUpdatePattern();

        const pattern = appWindow.arpPattern;
        expect(pattern).toBeDefined();
        // Octaves shifted by +1 and duplicated across 2 octaves
        expect(pattern?.values).toContain("C5");
        expect(pattern?.values).toContain("C6");
    });

    it("disposes previous pattern when updating", () => {
        createOrUpdatePattern();
        const firstPattern = appWindow.arpPattern;

        notesInput.value = "D4 F4 A4";
        createOrUpdatePattern();

        expect(firstPattern?.isDisposed).toBe(true);
        expect(appWindow.arpPattern).not.toBe(firstPattern);
        expect(appWindow.arpPattern?.values).toEqual(["D4", "F4", "A4"]);
    });

    it("handles missing notes element gracefully", () => {
        notesInput.remove();
        expect(() => createOrUpdatePattern()).not.toThrow();
    });

    it("handles empty note input gracefully without creating pattern", () => {
        notesInput.value = "";
        createOrUpdatePattern();
        expect(appWindow.arpPattern).toBeNull();
    });

    it("disposes an existing active pattern when note input is cleared during playback", () => {
        notesInput.value = "C4 E4 G4";
        createOrUpdatePattern();
        const activePattern = appWindow.arpPattern;
        expect(activePattern).toBeDefined();

        notesInput.value = "";
        createOrUpdatePattern();
        expect(activePattern?.isDisposed).toBe(true);
        expect(appWindow.arpPattern).toBeNull();
    });

    it("creates patterns for all 12 directions using realistic radio button DOM markup", () => {
        const directions = [
            { dir: "up", expectedPattern: "up", expectedValues: ["C4", "E4", "G4"] },
            { dir: "down", expectedPattern: "down", expectedValues: ["C4", "E4", "G4"] },
            { dir: "upDown", expectedPattern: "upDown", expectedValues: ["C4", "E4", "G4"] },
            { dir: "downUp", expectedPattern: "downUp", expectedValues: ["C4", "E4", "G4"] },
            {
                dir: "upDownRepeat",
                expectedPattern: "up",
                expectedValues: ["C4", "E4", "G4", "G4", "E4", "C4"],
            },
            {
                dir: "downUpRepeat",
                expectedPattern: "up",
                expectedValues: ["G4", "E4", "C4", "C4", "E4", "G4"],
            },
            { dir: "random", expectedPattern: "random", expectedValues: ["C4", "E4", "G4"] },
            { dir: "octaveCycle", expectedPattern: "up", minLength: 18 },
            { dir: "octaveCycleReverse", expectedPattern: "up", minLength: 18 },
            { dir: "octaveCyclePingPong", expectedPattern: "up", minLength: 21 },
            {
                dir: "randomWalk",
                expectedPattern: "randomWalk",
                expectedValues: ["C4", "E4", "G4"],
            },
            { dir: "randomWalkDrunk", expectedPattern: "up", minLength: 16 },
        ];

        for (const { dir, expectedPattern, expectedValues, minLength } of directions) {
            patternButtons.innerHTML = `
                <label>
                    <input type="radio" name="pattern-direction" value="${dir}" checked class="sr-only peer" data-pattern="${dir}" />
                    <span class="pattern-btn" data-pattern="${dir}">${dir}</span>
                </label>
            `;
            createOrUpdatePattern();
            const pattern = appWindow.arpPattern;
            expect(pattern).toBeDefined();
            expect(pattern?.pattern).toBe(expectedPattern);
            if (expectedValues) {
                expect(pattern?.values).toEqual(expectedValues);
            }
            if (minLength) {
                expect(pattern?.values.length).toBeGreaterThanOrEqual(minLength);
            }
        }
    });

    it("resolves pattern direction from visual .pattern-btn.selected span elements", () => {
        patternButtons.innerHTML = `
            <fieldset>
                <span class="pattern-btn selected" data-pattern="down">Down</span>
            </fieldset>
        `;
        createOrUpdatePattern();
        const pattern = appWindow.arpPattern;
        expect(pattern).toBeDefined();
        expect(pattern?.pattern).toBe("down");
    });

    it("resolves pattern direction from legacy button.selected elements", () => {
        patternButtons.innerHTML = `
            <div>
                <button class="selected" data-pattern="upDown">Up-Down</button>
            </div>
        `;
        createOrUpdatePattern();
        const pattern = appWindow.arpPattern;
        expect(pattern).toBeDefined();
        expect(pattern?.pattern).toBe("upDown");
    });

    it("correctly maps step highlights for non-up pattern indices", () => {
        const mockHighlight = vi.fn();
        appWindow.__WEB_ARP_STEP_HIGHLIGHT__ = mockHighlight;

        patternButtons.innerHTML = `
            <input type="radio" name="pattern-direction" value="down" checked />
        `;
        createOrUpdatePattern();

        const pattern = appWindow.arpPattern as (MockPatternInstance & { index?: number }) | null;
        expect(pattern).toBeDefined();

        // Simulate Tone.Pattern tick with step index 2 (G4 in down mode)
        if (pattern) {
            pattern.index = 2;
            pattern.callback(0.1, "G4");
            expect(mockHighlight).toHaveBeenCalledWith(2);

            // Simulate Tone.Pattern tick with step index 0 (C4 in down mode)
            pattern.index = 0;
            pattern.callback(0.2, "C4");
            expect(mockHighlight).toHaveBeenCalledWith(0);
        }
    });

    it("falls back to default interval and gate when elements are absent", () => {
        intervalSelect.remove();
        gateSlider.remove();
        patternButtons.remove();
        createOrUpdatePattern();
        const pattern = appWindow.arpPattern;
        expect(pattern).toBeDefined();
        expect(pattern?.interval).toBe("16n");
    });

    it("handles synth trigger fallback when scheduling with exact time fails", () => {
        const mockSynth = {
            triggerAttack: vi.fn((_n: string, time?: number) => {
                if (time !== undefined) throw new Error("Time scheduling failed");
            }),
            triggerRelease: vi.fn(),
        };

        appWindow.activeSynth = mockSynth;
        createOrUpdatePattern();

        const pattern = appWindow.arpPattern;
        expect(() => pattern?.callback(0.5, "C4")).not.toThrow();
        expect(mockSynth.triggerAttack).toHaveBeenCalledWith("C4");
    });
});

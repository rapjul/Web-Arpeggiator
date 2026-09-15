import { expect, test } from "./test-helpers";
import { ALLOWED_DIRECTIONS } from "@core/url-preset.js";
import {
    exportCurrentPatternMidiNotes,
    initializeAudio,
    resetBrowserState,
    runBrowser,
    waitForPwaReady,
} from "./test-helpers";

/**
 * The port number for the test server instance.
 * @type {number}
 */
const PORT: number = 4174;

/**
 * The root URL of the running application.
 * @type {string}
 */
const APP_URL: string = `http://127.0.0.1:${PORT}/index.html`;

const deterministicMidiSequences: Readonly<Record<string, readonly number[]>> = {
    up: [60, 64, 67],
    down: [67, 64, 60],
    upDown: [60, 64, 67, 64],
    downUp: [67, 64, 60, 64],
    upDownRepeat: [60, 64, 67, 67, 64, 60],
    downUpRepeat: [67, 64, 60, 60, 64, 67],
    octaveCycle: [60, 72, 84, 60, 72, 84, 64, 76, 88, 64, 76, 88, 67, 79, 91, 67, 79, 91],
    octaveCycleReverse: [91, 79, 67, 91, 79, 67, 88, 76, 64, 88, 76, 64, 84, 72, 60, 84, 72, 60],
    octaveCyclePingPong: [
        60, 72, 84, 72, 60, 72, 84, 64, 76, 88, 76, 64, 76, 88, 67, 79, 91, 79, 67, 79, 91,
    ],
};

const randomizedPatternLengths: Readonly<Record<string, number>> = {
    random: 3,
    randomWalk: 3,
    randomWalkDrunk: 16,
};

test("Arpeggiator Pattern Direction Verification Suite", async (): Promise<void> => {
    console.log("Starting Pattern Direction Integration Suite...");

    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Click overlay to trigger audio context resume
    console.log("Step 2: Initializing audio...");
    await initializeAudio();

    // 3. Exercise every direction the URL parser accepts and the UI exposes.
    const setupResult: string = await runBrowser([
        "eval",
        `(() => {
            const notes = document.getElementById("notes");
            const quantize = document.getElementById("scale-quantize-toggle");
            const octaveRange = document.querySelector("input[name='octave-range'][value='1']");
            const loopCount = document.getElementById("loop-count");
            if (!notes || !quantize || !octaveRange || !loopCount) {
                return "missing-pattern-setup-control";
            }

            notes.value = "C4 E4 G4";
            notes.dispatchEvent(new Event("input", { bubbles: true }));
            notes.dispatchEvent(new Event("change", { bubbles: true }));
            quantize.checked = false;
            quantize.dispatchEvent(new Event("change", { bubbles: true }));
            octaveRange.checked = true;
            octaveRange.dispatchEvent(new Event("change", { bubbles: true }));
            loopCount.value = "1";
            loopCount.dispatchEvent(new Event("change", { bubbles: true }));
            return "success";
        })()`,
    ]);
    expect(setupResult).toBe('"success"');

    for (const name of ALLOWED_DIRECTIONS) {
        console.log(`Testing pattern selection: ${name}`);

        // Click the matching pattern direction button in the DOM
        await runBrowser(["click", `[data-pattern='${name}']`]);

        // Wait briefly for pattern update
        await new Promise((resolve) => setTimeout(resolve, 300));

        const patternState: string = await runBrowser([
            "eval",
            `(async () => {
            const radio = document.querySelector("input[name='pattern-direction'][value='${name}']");
            if (!radio || !radio.checked) {
                return 'radio-not-checked: ' + '${name}';
            }

            const indicator = document.getElementById('note-step-indicator');
            if (!indicator || indicator.children.length === 0) {
                return 'missing-step-indicator-pips';
            }

            return 'success';
        })()`,
        ]);
        expect(patternState).toBe('"success"');

        const midiNotes = await exportCurrentPatternMidiNotes();
        const expectedSequence = deterministicMidiSequences[name];
        if (expectedSequence) {
            expect(midiNotes).toEqual(expectedSequence);
        } else {
            expect(midiNotes).toHaveLength(randomizedPatternLengths[name]);
            expect(midiNotes.every((pitch) => [60, 64, 67].includes(pitch))).toBe(true);
        }
    }

    console.log("All 12 pattern controls verified successfully!");
}, 45000);

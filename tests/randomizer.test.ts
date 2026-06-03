import { test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { startTestServer, runBrowser, waitForPwaReady, initializeAudio, resetBrowserState, cleanupProcesses } from "./test-helpers";

/**
 * References the background server process.
 * @type {Subprocess|null}
 */
let serverProcess: Subprocess | null = null;

/**
 * The port number for the test server instance.
 * @type {number}
 */
const PORT: number = 4178;

/**
 * The root URL of the running application.
 * @type {string}
 */
const APP_URL: string = `http://127.0.0.1:${PORT}/index.html`;

beforeAll(async (): Promise<void> => {
    // Clean up any stale browser processes from previous runs to release connection locks
    await spawn(["pkill", "-9", "-f", "agent-browser-chrome"]).exited;
    await spawn(["pkill", "-9", "-f", "agent-browser"]).exited;
    serverProcess = await startTestServer(PORT);
});

afterAll(async (): Promise<void> => {
    cleanupProcesses();
    await spawn(["pkill", "-9", "-f", "agent-browser-chrome"]).exited;
    await spawn(["pkill", "-9", "-f", "agent-browser"]).exited;
});

test("Randomize Notes Integration Suite", async (): Promise<void> => {
    console.log("Starting Randomizer Integration Suite...");
    
    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);
    
    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Initialize Audio playback
    console.log("Step 2: Initializing audio...");
    await initializeAudio();

    // 3. Verify Random Note Generation (Scale Quantization Off)
    console.log("Step 3: Testing random note generation with scale quantization disabled...");
    const unquantizedResult: string = await runBrowser(["eval", `(async () => {
        const randomizeBtn = document.getElementById('randomize-notes');
        const notesInput = document.getElementById('notes');
        const quantizeToggle = document.getElementById('scale-quantize-toggle');

        // Disable quantization
        quantizeToggle.checked = false;
        quantizeToggle.dispatchEvent(new Event('change'));

        // Trigger randomization click
        randomizeBtn.click();

        // Verify notes input value is not empty
        const notesVal = notesInput.value.trim();
        if (!notesVal) {
            return 'empty-input';
        }

        // Verify number of generated notes is between 4 and 6
        const notesArray = notesVal.split(/\\s+/);
        if (notesArray.length < 4 || notesArray.length > 6) {
            return 'incorrect-length: ' + notesArray.length;
        }

        // Verify each note is in valid Tone.js format within octaves 3-5
        const noteRegex = /^[A-G][#b]?[3-5]$/;
        for (const note of notesArray) {
            if (!noteRegex.test(note)) {
                return 'invalid-note-format: ' + note;
            }
        }

        return 'success';
    })()`]);
    expect(unquantizedResult).toBe('"success"');

    // 4. Verify Random Note Generation (Scale Quantization On: F Minor Scale)
    console.log("Step 4: Testing scale-quantized random note generation (F Minor)...");
    const quantizedResult: string = await runBrowser(["eval", `(async () => {
        const randomizeBtn = document.getElementById('randomize-notes');
        const notesInput = document.getElementById('notes');
        const quantizeToggle = document.getElementById('scale-quantize-toggle');
        const scaleRoot = document.getElementById('scale-root');
        const scaleType = document.getElementById('scale-type');

        // Enable quantization and set scale to F Minor
        quantizeToggle.checked = true;
        quantizeToggle.dispatchEvent(new Event('change'));
        scaleRoot.value = 'F';
        scaleRoot.dispatchEvent(new Event('change'));
        scaleType.value = 'minor';
        scaleType.dispatchEvent(new Event('change'));

        // Trigger randomization click
        randomizeBtn.click();

        // Verify notes input value is not empty
        const notesVal = notesInput.value.trim();
        const notesArray = notesVal.split(/\\s+/);

        // F Minor pitch classes
        const fMinorPitches = ['F', 'G', 'Ab', 'G#', 'Bb', 'A#', 'C', 'Db', 'C#', 'Eb', 'D#'];

        // Verify each note generated falls strictly within F Minor scale pitch classes
        for (const note of notesArray) {
            const pc = note.slice(0, -1); // Strip octave number
            if (!fMinorPitches.includes(pc)) {
                return 'invalid-note-for-scale: ' + note;
            }
        }

        // Verify pattern values in active Tone.Pattern are updated (using exposed window.arpPattern)
        if (!window.arpPattern || !window.arpPattern.values) {
            return 'missing-pattern';
        }
        
        for (const val of window.arpPattern.values) {
            const pc = val.slice(0, -1);
            if (!fMinorPitches.includes(pc)) {
                return 'invalid-pattern-note: ' + val;
            }
        }

        return 'success';
    })()`]);
    expect(quantizedResult).toBe('"success"');
    
    console.log("Randomizer Integration Suite complete!");
}, 30000);

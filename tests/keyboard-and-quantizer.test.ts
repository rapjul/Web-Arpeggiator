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
const PORT: number = 4176;

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

test("Keyboard Controls & Scale Quantizer Suite", async (): Promise<void> => {
    console.log("Starting Keyboard Controls & Scale Quantizer Integration Suite...");
    
    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);
    
    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Initialize Audio playback
    console.log("Step 2: Initializing audio...");
    await initializeAudio();

    // 3. Verify Virtual Keyboard UI Interactions
    console.log("Step 3: Testing virtual keyboard controls...");
    const keyboardResult: string = await runBrowser(["eval", `(async () => {
        const keyboardToggle = document.getElementById('keyboard-toggle');
        
        // Enable the keyboard
        keyboardToggle.checked = true;
        keyboardToggle.dispatchEvent(new Event('change'));

        // Trigger keydown on window for key 'z' (maps to C4)
        const eventDown = new KeyboardEvent('keydown', { key: 'z' });
        window.dispatchEvent(eventDown);

        // Verify key highlight active state
        const keyEl = document.querySelector('.piano-key[data-note="C4"]');
        if (!keyEl) {
            return 'missing-c4-key';
        }
        if (!keyEl.classList.contains('active')) {
            return 'key-not-active';
        }

        // Trigger keyup on window for key 'z'
        const eventUp = new KeyboardEvent('keyup', { key: 'z' });
        window.dispatchEvent(eventUp);

        // Verify highlight is cleared
        if (keyEl.classList.contains('active')) {
            return 'key-remained-active';
        }

        return 'success';
    })()`]);
    expect(keyboardResult).toBe('"success"');

    // 4. Verify Scale Quantizer snapping behavior
    console.log("Step 4: Testing scale quantization snapping...");
    const quantizerResult: string = await runBrowser(["eval", `(async () => {
        const quantizeToggle = document.getElementById('scale-quantize-toggle');
        const scaleRoot = document.getElementById('scale-root');
        const scaleType = document.getElementById('scale-type');
        const notesInput = document.getElementById('notes');

        // Enable scale quantization, set to C Major
        quantizeToggle.checked = true;
        quantizeToggle.dispatchEvent(new Event('change'));
        scaleRoot.value = 'C';
        scaleRoot.dispatchEvent(new Event('change'));
        scaleType.value = 'major';
        scaleType.dispatchEvent(new Event('change'));

        // Set base notes containing G#4 (which is out of C Major scale)
        notesInput.value = 'C4 D4 E4 F4 G#4';
        notesInput.dispatchEvent(new Event('change'));

        // Wait 100ms for debounced pattern rebuild
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify snapping by checking the Tone.Pattern values array
        if (!window.arpPattern || !window.arpPattern.values) {
            return 'missing-pattern';
        }
        
        // G#4 should not be in the values, it should have snapped to G4 or A4
        if (window.arpPattern.values.includes('G#4')) {
            return 'quantize-failed-gsharp-present';
        }
        
        // Check that notes snapped to valid C Major pitches
        const validPitches = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5'];
        for (const val of window.arpPattern.values) {
            if (!validPitches.includes(val)) {
                return 'invalid-pitch-in-quantized-pattern: ' + val;
            }
        }

        return 'success';
    })()`]);
    expect(quantizerResult).toBe('"success"');
    
    console.log("Keyboard Controls & Scale Quantizer Integration Suite complete!");
}, 30000);

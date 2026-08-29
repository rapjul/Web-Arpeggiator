import { afterAll, beforeAll, expect, test } from "bun:test";
import {
    cleanupProcesses,
    closeBrowser,
    initializeAudio,
    resetBrowserState,
    runBrowser,
    startTestServer,
    waitForPwaReady,
} from "../test-helpers";

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
    await startTestServer(PORT);
});

afterAll(async (): Promise<void> => {
    await closeBrowser();
    cleanupProcesses();
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
    const keyboardResult: string = await runBrowser([
        "eval",
        `(async () => {
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

        // Verify pitch label is rendered
        const pitchLabelEl = keyEl.querySelector('.key-pitch-label');
        if (!pitchLabelEl || pitchLabelEl.textContent !== 'C4') {
            return 'missing-or-invalid-pitch-label';
        }

        // Test "Add to Pattern" mode
        const addModeBtn = document.getElementById('keyboard-mode-add');
        const notesInput = document.getElementById('notes');
        if (addModeBtn && notesInput) {
            notesInput.value = 'C4 E4';
            notesInput.dispatchEvent(new Event('change'));

            // Enable Add to Pattern mode
            addModeBtn.click();

            // Click piano key for G4
            const g4Key = document.querySelector('.piano-key[data-note="G4"]');
            if (g4Key) {
                g4Key.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                g4Key.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

                // Verify notes input was appended
                if (!notesInput.value.includes('G4')) {
                    return 'add-to-pattern-failed: notes value is ' + notesInput.value;
                }
            }

            // Disable Add to Pattern mode
            addModeBtn.click();
        }

        return 'success';
    })()`,
    ]);
    expect(keyboardResult).toBe('"success"');

    // 4. Verify Scale Quantizer snapping behavior
    console.log("Step 4: Testing scale quantization snapping...");
    const quantizerResult: string = await runBrowser([
        "eval",
        `(async () => {
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
    })()`,
    ]);
    expect(quantizerResult).toBe('"success"');

    // 5. Verify Scale Quantizer 13-State Dropdown <-> Toggle Synchronization
    console.log("Step 5: Testing bidirectional scale quantization sync...");
    const syncResult: string = await runBrowser([
        "eval",
        `(async () => {
        const quantizeToggle = document.getElementById('scale-quantize-toggle');
        const scaleType = document.getElementById('scale-type');
        const statusLabel = document.getElementById('scale-quantize-toggle-status');

        // 1. Select 'chromatic' in dropdown -> should uncheck toggle and update status
        scaleType.value = 'chromatic';
        scaleType.dispatchEvent(new Event('change'));

        if (quantizeToggle.checked) {
            return 'sync-failed: toggle remained checked after selecting chromatic';
        }
        if (statusLabel.textContent !== 'Disabled') {
            return 'sync-failed: status not Disabled after chromatic: ' + statusLabel.textContent;
        }
        if (scaleType.disabled) {
            return 'lockout-bug: scaleType select was disabled!';
        }

        // 2. Select 'minor' in dropdown -> should check toggle and update status
        scaleType.value = 'minor';
        scaleType.dispatchEvent(new Event('change'));

        if (!quantizeToggle.checked) {
            return 'sync-failed: toggle not checked after selecting minor';
        }
        if (statusLabel.textContent !== 'Enabled') {
            return 'sync-failed: status not Enabled after selecting minor: ' + statusLabel.textContent;
        }

        // 3. Uncheck toggle -> dropdown should change to 'chromatic'
        quantizeToggle.checked = false;
        quantizeToggle.dispatchEvent(new Event('change'));

        if (scaleType.value !== 'chromatic') {
            return 'sync-failed: scaleType did not change to chromatic on toggle off: ' + scaleType.value;
        }
        if (scaleType.disabled) {
            return 'lockout-bug: scaleType select was disabled after toggle off!';
        }

        // 4. Check toggle -> dropdown should restore 'minor'
        quantizeToggle.checked = true;
        quantizeToggle.dispatchEvent(new Event('change'));

        if (scaleType.value !== 'minor') {
            return 'sync-failed: scaleType did not restore minor on toggle on: ' + scaleType.value;
        }

        return 'success';
    })()`,
    ]);
    expect(syncResult).toBe('"success"');

    console.log("Keyboard Controls & Scale Quantizer Integration Suite complete!");
}, 30000);

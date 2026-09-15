import { afterAll, beforeAll, expect, test } from "../test-helpers";
import {
    cleanupProcesses,
    closeBrowser,
    resetBrowserState,
    runBrowser,
    startTestServer,
    waitForPwaReady,
} from "../test-helpers";

/**
 * The port number for the test server instance.
 * @type {number}
 */
const PORT: number = 4179;

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

test("Audio Recording, Exports, & Preset Management Suite", async (): Promise<void> => {
    console.log("Starting Recording and Presets Integration Suite...");

    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Dismiss overlay to enable UI controls (playback is not playing yet)
    console.log("Step 2: Dismissing overlay to enable controls...");
    const overlayId: string = await runBrowser([
        "eval",
        `(() => {
            const qs = document.getElementById('quick-start-overlay');
            const simple = document.getElementById('start-overlay');
            if (qs && window.getComputedStyle(qs).display !== 'none') return 'quick-start-overlay';
            if (simple && window.getComputedStyle(simple).display !== 'none') return 'start-overlay';
            return 'none';
        })()`,
    ]);
    if (overlayId.includes("quick-start")) {
        await runBrowser(["click", "#quick-start-scratch"]);
    } else if (overlayId.includes("start-overlay")) {
        await runBrowser(["click", "#start-overlay"]);
    }
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    // 2a. Verify audio export mode controls and their visible state.
    console.log("Step 2a: Testing offline audio export modes...");
    const exportModeCheck: string = await runBrowser([
        "eval",
        `(() => {
            const seamless = document.getElementById('offline-export-mode-seamless');
            const tail = document.getElementById('offline-export-mode-tail');
            const tailControl = document.getElementById('offline-export-tail-control');
            const tailSeconds = document.getElementById('offline-export-tail-seconds');
            const modeHelp = document.getElementById('offline-export-mode-help');
            if (!seamless || !tail || !tailControl || !tailSeconds || !modeHelp || !tail.checked || tailSeconds.value !== '2') {
                return 'missing-defaults';
            }

            seamless.click();
            if (!tailControl.classList.contains('hidden') || !tailSeconds.disabled) return 'seamless-state-failed';

            tail.click();
            tailSeconds.value = '3.5';
            tailSeconds.dispatchEvent(new Event('input', { bubbles: true }));
            tailSeconds.dispatchEvent(new Event('change', { bubbles: true }));
            if (tailControl.classList.contains('hidden') || tailSeconds.disabled) return 'tail-state-failed';
            if (!tail.checked || tailSeconds.value !== '3.5') return 'settings-failed';
            if (!modeHelp.textContent.includes('sample-exact for WAV')) return 'missing-wav-guidance';
            return 'success';
        })()`,
    ]);
    expect(exportModeCheck).toBe('"success"');

    // 2b. Test clicking Record when audio playback is not playing
    console.log("Step 2b: Testing record button click when audio is idle...");
    await runBrowser(["click", "#record-button"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('record-button')?.classList.contains('recording') && document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);

    // Stop recording to reset for next steps
    await runBrowser(["click", "#record-button"]);
    await runBrowser([
        "wait",
        "--fn",
        "!document.getElementById('record-button')?.classList.contains('recording')",
    ]);

    // 3. Verify preset saving through the UI and IndexedDB.
    console.log("Step 3: Testing preset saving...");
    await runBrowser([
        "eval",
        `(async () => {
        const presetNameInput = document.getElementById('preset-name-input');
        const savePresetButton = document.getElementById('save-preset-to-browser-button');
        
        // Set a custom preset name
        presetNameInput.value = 'My test preset';
        presetNameInput.dispatchEvent(new Event('input'));

        // Trigger save
        savePresetButton.click();
    })()`,
    ]);

    // Wait for the async save to appear in the visible preset list.
    await runBrowser([
        "wait",
        "--fn",
        "[...document.getElementById('saved-preset-select').options].some((option) => option.textContent.includes('My test preset'))",
    ]);

    // Assert the preset was indeed saved correctly in IndexedDB
    const checkPresetSaved: string = await runBrowser([
        "eval",
        `(async () => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('web-arpeggiator-presets');
            request.addEventListener('success', () => resolve(request.result));
            request.addEventListener('error', () => reject(request.error));
        });
        const transaction = database.transaction('presetSnapshots', 'readonly');
        const request = transaction.objectStore('presetSnapshots').getAll();
        const records = await new Promise((resolve, reject) => {
            request.addEventListener('success', () => resolve(request.result));
            request.addEventListener('error', () => reject(request.error));
        });
        database.close();
        if (!records.some(r => r.name === 'My test preset')) {
            return 'not-saved';
        }
        const saved = records.find(r => r.name === 'My test preset');
        if (saved?.settings?.offlineExportMode !== 'tail' || saved.settings.offlineExportTailSeconds !== 3.5) {
            return 'export-settings-not-saved';
        }
        return 'success';
    })()`,
    ]);
    expect(checkPresetSaved).toBe('"success"');

    // 4. Verify Real-time Recording controls
    console.log("Step 4: Testing real-time recording controls...");
    await runBrowser([
        "eval",
        `(() => {
        const exportControls = document.getElementById('realtime-export-controls');
        if (exportControls) exportControls.classList.add('hidden');
    })()`,
    ]);

    // Click to start recording and wait for recording class and transport playback
    await runBrowser(["click", "#record-button"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('record-button')?.classList.contains('recording') && (document.getElementById('play-stop')?.textContent?.includes('Stop Audio') ?? false)",
    ]);

    // Wait 1.5 seconds to capture some buffer chunks
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Stop recording
    await runBrowser(["click", "#record-button"]);
    await runBrowser([
        "wait",
        "--fn",
        "!document.getElementById('record-button')?.classList.contains('recording')",
    ]);

    // Verify export controls are visible
    await runBrowser([
        "wait",
        "--fn",
        "!document.getElementById('realtime-export-controls')?.classList.contains('hidden')",
    ]);
    const checkExportControls: string = await runBrowser([
        "eval",
        `(() => {
        const exportControls = document.getElementById('realtime-export-controls');
        if (!exportControls || exportControls.classList.contains('hidden')) {
            return 'export-controls-hidden';
        }
        return 'success';
    })()`,
    ]);
    expect(checkExportControls).toBe('"success"');

    // 5. Verify Offline Loop Rendering
    console.log("Step 5: Testing offline loop rendering...");
    await runBrowser([
        "eval",
        `(async () => {
        const wavCheck = document.getElementById('offline-export-wav');
        const mp3Check = document.getElementById('offline-export-mp3');
        const offlineBtn = document.getElementById('offline-export-button');
        const loopCountInput = document.getElementById('loop-count');

        // Select WAV only to make it fast
        wavCheck.checked = true;
        mp3Check.checked = false;
        loopCountInput.value = '1';
        const tailSeconds = document.getElementById('offline-export-tail-seconds');
        tailSeconds.value = '0';
        tailSeconds.dispatchEvent(new Event('change', { bubbles: true }));

        // Click offline render
        offlineBtn.click();
    })()`,
    ]);

    // Wait for rendering to complete (status text changes to 'Offline export complete!')
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('offline-export-status')?.textContent.includes('Offline export complete!')",
    ]);

    console.log("Recording and Presets Integration Suite complete!");
}, 30000);

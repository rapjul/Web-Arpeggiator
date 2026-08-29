import { afterAll, beforeAll, expect, test } from "bun:test";
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
    await runBrowser(["click", "#start-overlay"]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

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

    // 3. Verify Preset Saving (IndexedDB & file download hook)
    console.log("Step 3: Testing preset saving...");
    await runBrowser([
        "eval",
        `(async () => {
        const presetNameInput = document.getElementById('preset-name-input');
        const savePresetButton = document.getElementById('save-preset-to-browser-button');
        
        // Set a custom preset name
        presetNameInput.value = 'My test preset';
        presetNameInput.dispatchEvent(new Event('input'));

        // Reset the lastSaveFinished flag on the test bridge
        window.__WEB_ARP_TEST__.lastSaveFinished = false;

        // Trigger save
        savePresetButton.click();
    })()`,
    ]);

    // Wait for the async IndexedDB save to finish
    await runBrowser(["wait", "--fn", "window.__WEB_ARP_TEST__.lastSaveFinished === true"]);

    // Assert the preset was indeed saved correctly in IndexedDB
    const checkPresetSaved: string = await runBrowser([
        "eval",
        `(async () => {
        const records = await window.__WEB_ARP_TEST__.listPresets();
        if (!records.some(r => r.name === 'My test preset')) {
            return 'not-saved';
        }
        return 'success';
    })()`,
    ]);
    expect(checkPresetSaved).toBe('"success"');

    // 4. Verify Real-time Recording controls
    console.log("Step 4: Testing real-time recording controls...");
    const startRecordResult: string = await runBrowser([
        "eval",
        `(async () => {
        const recordBtn = document.getElementById('record-button');
        const exportControls = document.getElementById('realtime-export-controls');

        // Make sure export controls are hidden initially
        exportControls.classList.add('hidden');

        // Click to start recording
        recordBtn.click();
        if (!recordBtn.classList.contains('recording')) {
            return 'record-btn-missing-recording-class';
        }

        // Verify transport auto-started playback
        const playBtn = document.getElementById('play-stop');
        if (playBtn && !playBtn.textContent.includes('Stop Audio')) {
            return 'playback-not-autostarted-on-record: ' + playBtn.textContent;
        }

        return 'success';
    })()`,
    ]);
    expect(startRecordResult).toBe('"success"');

    // Wait 1.5 seconds to capture some buffer chunks
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Stop recording
    await runBrowser([
        "eval",
        `(async () => {
        const recordBtn = document.getElementById('record-button');
        recordBtn.click();
    })()`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify export controls are visible
    const checkExportControls: string = await runBrowser([
        "eval",
        `(async () => {
        const exportControls = document.getElementById('realtime-export-controls');
        if (exportControls.classList.contains('hidden')) {
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

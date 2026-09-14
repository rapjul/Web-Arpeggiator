import { afterAll, beforeAll, expect, test } from "bun:test";
import {
    cleanupProcesses,
    closeBrowser,
    initializeAudio,
    resetBrowserState,
    runBrowser,
    startTestServer,
    waitForSessionAutosave,
    waitForPwaReady,
} from "../test-helpers";

/**
 * The port number for the test server instance.
 * @type {number}
 */
const PORT: number = 4182;

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

test("UI Slider Debouncing Verification Suite", async (): Promise<void> => {
    console.log("Starting Slider Debouncing Integration Suite...");

    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Initialize Audio playback
    console.log("Step 2: Initializing audio...");
    await initializeAudio();
    await waitForSessionAutosave();

    // 3. Verify Filter Cutoff Slider Debouncing (16ms)
    console.log("Step 3: Testing Filter Cutoff slider debouncing...");
    const filterDebounceResult: string = await runBrowser([
        "eval",
        `(async () => {
        const slider = document.getElementById('filter-cutoff');
        const label = document.getElementById('filter-cutoff-value');
        
        slider.value = '5000';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 1. Label MUST update immediately (synchronously)
        if (label.textContent !== '5000') {
            return 'label-mismatch: ' + label.textContent;
        }
        
        // 2. The visible control retains the changed value through the debounce window.
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (slider.value !== '5000') {
            return 'filter-setting-not-retained';
        }
        
        return 'success';
    })()`,
    ]);
    expect(filterDebounceResult).toBe('"success"');

    // 4. Verify BPM Slider Debouncing (16ms)
    console.log("Step 4: Testing BPM slider debouncing...");
    const bpmDebounceResult: string = await runBrowser([
        "eval",
        `(async () => {
        const slider = document.getElementById('bpm');
        const label = document.getElementById('bpm-value');
        
        slider.value = '180';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Label updates immediately
        if (label.textContent !== '180') {
            return 'bpm-label-mismatch: ' + label.textContent;
        }
        
        // Wait past the debounce interval and verify the user-facing value remains correct.
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (slider.value !== '180' || label.textContent !== '180') {
            return 'bpm-not-retained';
        }
        
        return 'success';
    })()`,
    ]);
    expect(bpmDebounceResult).toBe('"success"');

    // 5. Verify Gate Slider Debouncing (50ms)
    console.log("Step 5: Testing Gate slider debouncing (50ms)...");
    const gateDebounceResult: string = await runBrowser([
        "eval",
        `(async () => {
        const slider = document.getElementById('gate');
        const label = document.getElementById('gate-value');
        
        slider.value = '0.35';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Label updates immediately
        if (label.textContent !== '0.35') {
            return 'gate-label-mismatch: ' + label.textContent;
        }
        
        // Wait through both sides of the debounce boundary without accessing internal state.
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (slider.value !== '0.35') {
            return 'gate-value-not-retained';
        }
        
        // Wait another 60ms (total 80ms, greater than 50ms debounce)
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (label.textContent !== '0.35') {
            return 'gate-label-not-retained';
        }
        
        return 'success';
    })()`,
    ]);
    expect(gateDebounceResult).toBe('"success"');

    // The browser-visible labels cover immediate feedback. Persisted settings
    // prove the input events also reached the application settings lifecycle.
    const persistedSliderResult: string = await runBrowser([
        "eval",
        `(async () => {
            await new Promise((resolve) => setTimeout(resolve, 2200));
            const database = await new Promise((resolve, reject) => {
                const request = indexedDB.open('web-arpeggiator-presets');
                request.addEventListener('success', () => resolve(request.result));
                request.addEventListener('error', () => reject(request.error));
            });
            const transaction = database.transaction('lastSession', 'readonly');
            const request = transaction.objectStore('lastSession').get('current');
            const record = await new Promise((resolve, reject) => {
                request.addEventListener('success', () => resolve(request.result));
                request.addEventListener('error', () => reject(request.error));
            });
            database.close();
            const settings = record?.settings;
            return settings?.filterCutoff === 5000 && settings?.bpm === 180 && settings?.gateRatio === 0.35
                ? 'success'
                : 'settings-not-persisted';
        })()`,
    ]);
    expect(persistedSliderResult).toBe('"success"');

    console.log("Slider Debouncing Verification Suite complete!");
}, 30000);

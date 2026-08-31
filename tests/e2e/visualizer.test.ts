import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
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
const PORT: number = 4177;

/**
 * The root URL of the running application.
 * @type {string}
 */
const APP_URL: string = `http://127.0.0.1:${PORT}/index.html`;

/**
 * Directory where visual screenshots will be stored.
 * @type {string}
 */
const SNAPSHOTS_DIR: string = join(import.meta.dir, "visualizer-snapshots");

beforeAll(async (): Promise<void> => {
    await mkdir(SNAPSHOTS_DIR, { recursive: true });
    await startTestServer(PORT);
});

afterAll(async (): Promise<void> => {
    await closeBrowser();
    cleanupProcesses();
});

/**
 * Ensures the visualizer accordion details container is open and scrolls it into view.
 *
 * @returns {Promise<void>}
 */
async function scrollVisualizerIntoView(): Promise<void> {
    console.log("  Ensuring visualizer details accordion is open...");
    await runBrowser([
        "eval",
        `(async () => {
        const container = document.getElementById('visualizer-container');
        if (container) {
            const det = container.closest('details');
            if (det) det.open = true;
        }
    })()`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log("  Scrolling visualizer into view...");
    await runBrowser(["scrollintoview", "#visualizer-container"]);
    await new Promise((resolve) => setTimeout(resolve, 500));
}

/**
 * Switches the visualizer to the specified mode, cycles zoom factors, and captures screenshots.
 *
 * @param {string} mode - The visualizer mode (oscilloscope, fft, loopMap).
 * @returns {Promise<void>}
 */
async function testVisualizerMode(mode: string): Promise<void> {
    console.log(`Testing visualizer mode: ${mode}`);

    // Switch visualizer mode
    await runBrowser(["select", "#visualizer-mode", mode]);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Ensure centered
    await scrollVisualizerIntoView();

    // 1. Capture at 1.0x Zoom
    console.log("  Setting Zoom to 1.0x...");
    await runBrowser([
        "eval",
        `(async () => {
        const zoomInput = document.getElementById('visualizer-zoom');
        if (zoomInput) {
            zoomInput.value = 1.0;
            zoomInput.dispatchEvent(new Event('input'));
            zoomInput.dispatchEvent(new Event('change'));
        }
    })()`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await runBrowser(["screenshot", join(SNAPSHOTS_DIR, `${mode}_1x.png`)]);
    console.log(`  Captured screenshot: ${mode}_1x.png`);

    // 2. Capture at 4.0x Zoom
    console.log("  Setting Zoom to 4.0x...");
    await runBrowser([
        "eval",
        `(async () => {
        const zoomInput = document.getElementById('visualizer-zoom');
        if (zoomInput) {
            zoomInput.value = 4.0;
            zoomInput.dispatchEvent(new Event('input'));
            zoomInput.dispatchEvent(new Event('change'));
        }
    })()`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await runBrowser(["screenshot", join(SNAPSHOTS_DIR, `${mode}_4x.png`)]);
    console.log(`  Captured screenshot: ${mode}_4x.png`);

    // Reset Zoom back to 1.0x
    await runBrowser([
        "eval",
        `(async () => {
        const zoomInput = document.getElementById('visualizer-zoom');
        if (zoomInput) {
            zoomInput.value = 1.0;
            zoomInput.dispatchEvent(new Event('input'));
            zoomInput.dispatchEvent(new Event('change'));
        }
    })()`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));
}

test("Canvas Visualizer Suite", async (): Promise<void> => {
    console.log("Starting Visualizer Integration Suite...");

    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Initialize Audio playback
    console.log("Step 2: Initializing audio...");
    await initializeAudio();

    // 3. Open details accordion to make visualizer interactive
    console.log("Step 3: Opening visualizer details...");
    await runBrowser([
        "eval",
        `(async () => {
        const toggleBtn = document.getElementById('toggle-visualizer');
        if (toggleBtn) {
            const det = toggleBtn.closest('details');
            if (det) det.open = true;
        }
    })()`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 4. Enable the visualizer
    console.log("Step 4: Enabling visualizer...");
    await runBrowser(["click", "#toggle-visualizer"]);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 5. Test all modes
    await testVisualizerMode("oscilloscope");
    await testVisualizerMode("fft");
    await testVisualizerMode("loopMap");

    // 6. Extra test: Cycle Time Windows in Oscilloscope Mode
    console.log("Step 6: Testing Oscilloscope Time Window Settings...");
    await runBrowser(["select", "#visualizer-mode", "oscilloscope"]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await scrollVisualizerIntoView();

    // Switch to 250ms timeframe and capture
    console.log("  Setting Oscilloscope Time Window to 250ms...");
    await runBrowser(["select", "#oscilloscope-window", "250"]);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await runBrowser(["screenshot", join(SNAPSHOTS_DIR, "oscilloscope_250ms.png")]);

    // Switch to 1.0s timeframe and capture
    console.log("  Setting Oscilloscope Time Window to 1.0s...");
    await runBrowser(["select", "#oscilloscope-window", "1000"]);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await runBrowser(["screenshot", join(SNAPSHOTS_DIR, "oscilloscope_1000ms.png")]);

    // 7. Test Loop Map updates on Octave Range & Shift parameter changes
    console.log("Step 7: Testing Loop Map Canvas Updates on Octave Changes...");
    await runBrowser(["select", "#visualizer-mode", "loopMap"]);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const octaveUpdateCheck: string = await runBrowser([
        "eval",
        `(() => {
            const rangeRadio3 = document.querySelector('#octave-range-buttons input[value="3"]');
            if (!rangeRadio3) return 'range-radio-3-not-found';
            rangeRadio3.checked = true;
            rangeRadio3.dispatchEvent(new Event('change', { bubbles: true }));

            const shiftRadio1 = document.querySelector('#octave-shift-buttons input[value="1"]');
            if (!shiftRadio1) return 'shift-radio-1-not-found';
            shiftRadio1.checked = true;
            shiftRadio1.dispatchEvent(new Event('change', { bubbles: true }));

            return 'success';
        })()`,
    ]);
    expect(octaveUpdateCheck).toBe('"success"');
    await new Promise((resolve) => setTimeout(resolve, 400));

    console.log("Visualizer Integration Suite complete!");
}, 45000);

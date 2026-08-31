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

    // Test Octave Range variations (1 -> 3 -> 5) and assert observable marker count scaling
    const expectedCounts: Record<string, number> = { "1": 3, "3": 9, "5": 15 };
    for (const rangeVal of ["1", "3", "5"]) {
        const rangeResultStr: string = await runBrowser([
            "eval",
            `(() => {
                const radio = document.querySelector('#octave-range-buttons input[value="${rangeVal}"]');
                if (!radio) throw new Error('Missing octave range radio for value: ${rangeVal}');
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                return 'dispatched';
            })()`,
        ]);
        expect(rangeResultStr).toBe('"dispatched"');
        // Allow debounced render to execute
        await new Promise((resolve) => setTimeout(resolve, 350));

        const markerCountStr: string = await runBrowser([
            "eval",
            `(() => {
                const state = window.__WEB_ARP_TEST__?.getLoopMapState?.();
                return state?.markers?.length ?? 0;
            })()`,
        ]);
        expect(Number.parseInt(markerCountStr, 10)).toBe(expectedCounts[rangeVal]);
    }

    // Reset range to 1 before testing shift
    await runBrowser([
        "eval",
        `(() => {
            const radio = document.querySelector('#octave-range-buttons input[value="1"]');
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        })()`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Test Octave Shift variations (-2 -> 0 -> +2) and assert transposed pitch registers
    const expectedRootPitch: Record<string, string> = { "-2": "C2", "0": "C4", "2": "C6" };
    for (const shiftVal of ["-2", "0", "2"]) {
        const shiftResultStr: string = await runBrowser([
            "eval",
            `(() => {
                const radio = document.querySelector('#octave-shift-buttons input[value="${shiftVal}"]');
                if (!radio) throw new Error('Missing octave shift radio for value: ${shiftVal}');
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                return 'dispatched';
            })()`,
        ]);
        expect(shiftResultStr).toBe('"dispatched"');
        // Allow debounced render to execute
        await new Promise((resolve) => setTimeout(resolve, 350));

        const firstMarkerPitch: string = await runBrowser([
            "eval",
            `(() => {
                const state = window.__WEB_ARP_TEST__?.getLoopMapState?.();
                return state?.markers?.[0]?.note ?? '';
            })()`,
        ]);
        expect(firstMarkerPitch).toBe(`"${expectedRootPitch[shiftVal]}"`);
    }

    // 8. Test Loop Map updates on Pattern Direction, Notes, and Scale Quantization
    console.log(
        "Step 8: Testing Loop Map Canvas Updates on Pattern, Notes, and Quantization Changes...",
    );

    // 8a. Test Pattern Direction radio change
    const patternChangeStr: string = await runBrowser([
        "eval",
        `(() => {
            const radio = document.querySelector('#pattern-buttons input[value="octaveCycle"]');
            if (!radio) throw new Error('Missing pattern radio for octaveCycle');
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            return 'dispatched';
        })()`,
    ]);
    expect(patternChangeStr).toBe('"dispatched"');
    await new Promise((resolve) => setTimeout(resolve, 350));

    const octaveCycleMarkersCount: string = await runBrowser([
        "eval",
        `(() => {
            const state = window.__WEB_ARP_TEST__?.getLoopMapState?.();
            return state?.markers?.length ?? 0;
        })()`,
    ]);
    expect(Number.parseInt(octaveCycleMarkersCount, 10)).toBeGreaterThan(0);

    // 8b. Test Note Input modification
    const notesChangeStr: string = await runBrowser([
        "eval",
        `(() => {
            const notesInput = document.getElementById('notes');
            if (!notesInput) throw new Error('Missing notes input');
            notesInput.value = 'D3 F#3 A3';
            notesInput.dispatchEvent(new Event('input', { bubbles: true }));
            notesInput.dispatchEvent(new Event('change', { bubbles: true }));
            return 'dispatched';
        })()`,
    ]);
    expect(notesChangeStr).toBe('"dispatched"');
    await new Promise((resolve) => setTimeout(resolve, 350));

    const updatedNotePitch: string = await runBrowser([
        "eval",
        `(() => {
            const state = window.__WEB_ARP_TEST__?.getLoopMapState?.();
            return state?.markers?.[0]?.note ?? '';
        })()`,
    ]);
    expect(updatedNotePitch).toContain("D");

    // 8c. Test Scale Quantization toggle (starts true, toggle to false)
    const quantizeToggleStr: string = await runBrowser([
        "eval",
        `(() => {
            const quantizeCheckbox = document.getElementById('scale-quantize-toggle');
            if (!quantizeCheckbox) throw new Error('Missing scale quantize checkbox');
            quantizeCheckbox.checked = false;
            quantizeCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            return 'dispatched';
        })()`,
    ]);
    expect(quantizeToggleStr).toBe('"dispatched"');
    await new Promise((resolve) => setTimeout(resolve, 350));

    // 8d. Test Scale Root selection
    const rootChangeStr: string = await runBrowser([
        "eval",
        `(() => {
            const rootSelect = document.getElementById('scale-root');
            if (!rootSelect) throw new Error('Missing scale root select');
            rootSelect.value = 'G';
            rootSelect.dispatchEvent(new Event('change', { bubbles: true }));
            return 'dispatched';
        })()`,
    ]);
    expect(rootChangeStr).toBe('"dispatched"');
    await new Promise((resolve) => setTimeout(resolve, 350));

    // 8e. Test Note Interval dropdown
    const intervalChangeStr: string = await runBrowser([
        "eval",
        `(() => {
            const intervalSelect = document.getElementById('interval');
            if (!intervalSelect) throw new Error('Missing interval select');
            intervalSelect.value = '8n';
            intervalSelect.dispatchEvent(new Event('change', { bubbles: true }));
            return 'dispatched';
        })()`,
    ]);
    expect(intervalChangeStr).toBe('"dispatched"');
    await new Promise((resolve) => setTimeout(resolve, 350));

    console.log("Visualizer Integration Suite complete!");
}, 45000);

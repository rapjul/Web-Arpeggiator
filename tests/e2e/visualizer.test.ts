import { expect, test } from "./test-helpers";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeAudio, resetBrowserState, runBrowser, waitForPwaReady } from "./test-helpers";

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
const SNAPSHOTS_DIR: string = join(
    fileURLToPath(new URL(".", import.meta.url)),
    "visualizer-snapshots",
);

const LOOP_MAP_FINGERPRINT = `(() => {
    const canvas = document.getElementById('visualizer-plot');
    if (!(canvas instanceof HTMLCanvasElement)) return '';
    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0 || canvas.height === 0) return '';
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasNoteLabel = false;
    let hash = 2166136261;
    for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] === 56 && pixels[index + 1] === 189 && pixels[index + 2] === 248) {
            hasNoteLabel = true;
        }
        hash = Math.imul(hash ^ pixels[index], 16777619);
        hash = Math.imul(hash ^ pixels[index + 1], 16777619);
        hash = Math.imul(hash ^ pixels[index + 2], 16777619);
        hash = Math.imul(hash ^ pixels[index + 3], 16777619);
    }
    return hasNoteLabel ? canvas.width + ':' + canvas.height + ':' + (hash >>> 0) : '';
})()`;

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
 * Returns a compact fingerprint of the rendered Loop Map canvas.
 *
 * @returns {Promise<string>} Pixel-based canvas fingerprint.
 */
async function getLoopMapFingerprint(): Promise<string> {
    await runBrowser(["wait", "--fn", `${LOOP_MAP_FINGERPRINT} !== ''`]);
    const result = await runBrowser(["eval", LOOP_MAP_FINGERPRINT]);
    return JSON.parse(result);
}

async function waitForLoopMapRerender(previousFingerprint: string): Promise<string> {
    await runBrowser([
        "wait",
        "--fn",
        `${LOOP_MAP_FINGERPRINT} !== '' && ${LOOP_MAP_FINGERPRINT} !== ${JSON.stringify(previousFingerprint)}`,
    ]);
    const fingerprint = await getLoopMapFingerprint();
    expect(fingerprint).not.toBe(previousFingerprint);
    return fingerprint;
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
    await mkdir(SNAPSHOTS_DIR, { recursive: true });

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
    let previousLoopMapFingerprint = await getLoopMapFingerprint();
    expect(previousLoopMapFingerprint).not.toBe("");

    // Test Octave Range variations (1 -> 3 -> 5) through their visible controls.
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

        const selectedRange: string = await runBrowser([
            "eval",
            `(() => {
                return document.querySelector('#octave-range-buttons input:checked')?.value ?? '';
            })()`,
        ]);
        expect(selectedRange).toBe(`"${rangeVal}"`);
        previousLoopMapFingerprint = await waitForLoopMapRerender(previousLoopMapFingerprint);
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
    previousLoopMapFingerprint = await waitForLoopMapRerender(previousLoopMapFingerprint);

    // Test Octave Shift variations (-2 -> 0 -> +2) through their visible controls.
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

        const selectedShift: string = await runBrowser([
            "eval",
            `(() => {
                return document.querySelector('#octave-shift-buttons input:checked')?.value ?? '';
            })()`,
        ]);
        expect(selectedShift).toBe(`"${shiftVal}"`);
        previousLoopMapFingerprint = await waitForLoopMapRerender(previousLoopMapFingerprint);
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

    const octaveCycleSelection: string = await runBrowser([
        "eval",
        `(() => {
            return document.querySelector('#pattern-buttons input:checked')?.value ?? '';
        })()`,
    ]);
    expect(octaveCycleSelection).toBe('"octaveCycle"');
    previousLoopMapFingerprint = await waitForLoopMapRerender(previousLoopMapFingerprint);

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

    const updatedNotes: string = await runBrowser([
        "eval",
        `(() => {
            return document.getElementById('notes')?.value ?? '';
        })()`,
    ]);
    expect(updatedNotes).toBe('"D3 F#3 A3"');
    previousLoopMapFingerprint = await waitForLoopMapRerender(previousLoopMapFingerprint);

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
    previousLoopMapFingerprint = await waitForLoopMapRerender(previousLoopMapFingerprint);

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
    previousLoopMapFingerprint = await waitForLoopMapRerender(previousLoopMapFingerprint);

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
    await waitForLoopMapRerender(previousLoopMapFingerprint);

    console.log("Visualizer Integration Suite complete!");
}, 60000);

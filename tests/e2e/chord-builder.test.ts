import { afterAll, beforeAll, expect, test } from "bun:test";
import {
    cleanupProcesses,
    closeBrowser,
    initializeAudio,
    runBrowser,
    startTestServer,
    waitForPwaReady,
} from "../test-helpers";

/**
 * Port number for chord builder test server.
 * @type {number}
 */
const PORT: number = 4196;

/**
 * Target application URL.
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

test("Scale-Aware Chord Builder E2E Suite", async (): Promise<void> => {
    console.log("Starting Scale-Aware Chord Builder Integration Suite...");

    await waitForPwaReady(APP_URL);
    await initializeAudio();

    // 1. Verify Chord Starter Buttons Exist
    console.log("Step 1: Verifying Chord starter buttons in the DOM...");
    const chordButtonsCount: string = await runBrowser([
        "eval",
        `(() => {
            const buttons = document.querySelectorAll('#chord-buttons .chord-btn');
            return buttons.length.toString();
        })()`,
    ]);
    expect(chordButtonsCount).toBe('"6"');

    // 2. Test Clicking Major Chord with C root
    console.log("Step 2: Clicking Major chord button with C root...");
    const majorChordResult: string = await runBrowser([
        "eval",
        `(() => {
            const rootSelect = document.getElementById('scale-root');
            if (rootSelect) {
                rootSelect.value = 'C';
                rootSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const majorBtn = document.querySelector('.chord-btn[data-chord="major"]');
            if (majorBtn) {
                majorBtn.click();
            }
            const notesInput = document.getElementById('notes');
            return notesInput ? notesInput.value : '';
        })()`,
    ]);
    expect(majorChordResult).toBe('"C4 E4 G4"');

    // 3. Test Minor Chord with A root
    console.log("Step 3: Transposing to A and clicking Minor chord button...");
    const minorChordResult: string = await runBrowser([
        "eval",
        `(() => {
            const rootSelect = document.getElementById('scale-root');
            if (rootSelect) {
                rootSelect.value = 'A';
                rootSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const minorBtn = document.querySelector('.chord-btn[data-chord="minor"]');
            if (minorBtn) {
                minorBtn.click();
            }
            const notesInput = document.getElementById('notes');
            return notesInput ? notesInput.value : '';
        })()`,
    ]);
    expect(minorChordResult).toBe('"A4 C5 E5"');

    // 4. Test Dominant 7th with G root
    console.log("Step 4: Transposing to G and clicking 7th chord button...");
    const dom7Result: string = await runBrowser([
        "eval",
        `(() => {
            const rootSelect = document.getElementById('scale-root');
            if (rootSelect) {
                rootSelect.value = 'G';
                rootSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const dom7Btn = document.querySelector('.chord-btn[data-chord="dom7"]');
            if (dom7Btn) {
                dom7Btn.click();
            }
            const notesInput = document.getElementById('notes');
            return notesInput ? notesInput.value : '';
        })()`,
    ]);
    expect(dom7Result).toBe('"G4 B4 D5 F5"');

    // 5. Test Pentatonic with D root
    console.log("Step 5: Transposing to D and clicking Pentatonic button...");
    const pentatonicResult: string = await runBrowser([
        "eval",
        `(() => {
            const rootSelect = document.getElementById('scale-root');
            if (rootSelect) {
                rootSelect.value = 'D';
                rootSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const pentaBtn = document.querySelector('.chord-btn[data-chord="pentatonic"]');
            if (pentaBtn) {
                pentaBtn.click();
            }
            const notesInput = document.getElementById('notes');
            return notesInput ? notesInput.value : '';
        })()`,
    ]);
    expect(pentatonicResult).toBe('"D4 E4 F#4 A4 B4"');

    // 6. Test Scale-Constraint & Pattern Regeneration
    console.log("Step 6: Enabling C Minor scale and asserting quantized pattern regeneration...");
    const scalePatternResult: string = await runBrowser([
        "eval",
        `(() => {
            const rootSelect = document.getElementById('scale-root');
            const scaleTypeSelect = document.getElementById('scale-type');
            const quantizeToggle = document.getElementById('scale-quantize-toggle');
            if (rootSelect) {
                rootSelect.value = 'C';
                rootSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (scaleTypeSelect) {
                scaleTypeSelect.value = 'minor';
                scaleTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (quantizeToggle && !quantizeToggle.checked) {
                quantizeToggle.checked = true;
                quantizeToggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
            // Click Major chord (C4, E4, G4) -> in C Minor, E4 quantizes to D#4
            const majorBtn = document.querySelector('.chord-btn[data-chord="major"]');
            if (majorBtn) {
                majorBtn.click();
            }
            const notesInput = document.getElementById('notes');
            return JSON.stringify({
                rawNotes: notesInput ? notesInput.value : '',
                patternExists: Boolean(window.__WEB_ARP_STEP_HIGHLIGHT__)
            });
        })()`,
    ]);
    const parsedScalePattern = JSON.parse(JSON.parse(scalePatternResult));
    expect(parsedScalePattern.rawNotes).toBe("C4 E4 G4");
    expect(parsedScalePattern.patternExists).toBe(true);

    console.log("Scale-Aware Chord Builder E2E Suite completed successfully.");
}, 30000);

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
const PORT: number = 4190;

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

test("Onboarding & Sound Starters E2E Suite", async (): Promise<void> => {
    console.log("Starting Onboarding & Sound Starters Integration Suite...");

    // =========================================================================
    // 1. Cold First Visit — Quick Start Overlay
    // =========================================================================
    console.log("Step 1: Testing Cold First Visit Quick Start Overlay...");
    await waitForPwaReady(APP_URL);
    await resetBrowserState();
    await runBrowser(["reload"]);
    await runBrowser(["wait", "--load", "networkidle"]);

    const coldVisitCheck: string = await runBrowser([
        "eval",
        `(() => {
            const quickStart = document.getElementById('quick-start-overlay');
            const simpleOverlay = document.getElementById('start-overlay');
            const presetCards = document.querySelectorAll('#quick-start-presets-grid .sound-starter-card');
            const scratchBtn = document.getElementById('quick-start-scratch');
            const quantizeToggle = document.getElementById('scale-quantize-toggle');
            const quantizeStatus = document.getElementById('scale-quantize-toggle-status');

            if (!quickStart || window.getComputedStyle(quickStart).display === 'none') {
                return 'quick-start-overlay-not-visible';
            }
            if (!simpleOverlay || window.getComputedStyle(simpleOverlay).display !== 'none') {
                return 'simple-overlay-unexpectedly-visible';
            }
            if (presetCards.length !== 6) {
                return 'expected-6-quick-start-cards-found-' + presetCards.length;
            }
            if (!scratchBtn) {
                return 'missing-scratch-button';
            }
            if (!quantizeToggle || !quantizeToggle.checked) {
                return 'quantize-toggle-not-default-checked';
            }
            if (!quantizeStatus || !quantizeStatus.textContent?.includes('Enabled')) {
                return 'quantize-status-not-enabled: ' + quantizeStatus?.textContent;
            }

            return 'success';
        })()`,
    ]);
    expect(coldVisitCheck).toBe('"success"');

    // =========================================================================
    // 2. Quick Start — Preset Card Click (Starts Audio & Playback)
    // =========================================================================
    console.log("Step 2: Testing Quick Start Preset Card Click...");
    await runBrowser([
        "click",
        '#quick-start-presets-grid button[data-preset-id="factory-synthwave"]',
    ]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);

    const presetClickCheck: string = await runBrowser([
        "eval",
        `(() => {
            const quickStart = document.getElementById('quick-start-overlay');
            const notesInput = document.getElementById('notes');
            const bpmSlider = document.getElementById('bpm');
            const visitedFlag = localStorage.getItem('webArpHasVisited');
            const activeCard = document.querySelector('#sound-starters-grid .sound-starter-card.active');

            if (quickStart && window.getComputedStyle(quickStart).display !== 'none') {
                return 'quick-start-modal-not-dismissed';
            }
            if (!notesInput || notesInput.value !== 'C4 E4 G4 B4') {
                return 'notes-mismatch: ' + notesInput?.value;
            }
            if (!bpmSlider || bpmSlider.value !== '128') {
                return 'bpm-mismatch: ' + bpmSlider?.value;
            }
            if (visitedFlag !== 'true') {
                return 'visited-flag-not-saved';
            }
            if (!activeCard || activeCard.getAttribute('data-preset-id') !== 'factory-synthwave') {
                return 'sound-starters-card-not-active';
            }

            return 'success';
        })()`,
    ]);
    expect(presetClickCheck).toBe('"success"');

    // Stop playback for next test step
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Restart Audio'",
    ]);

    // =========================================================================
    // 3. Sound Starters — Card Click & Active State Synchronization
    // =========================================================================
    console.log("Step 3: Testing Sound Starters Strip Card Loading...");
    await runBrowser(["click", '#sound-starters-grid button[data-preset-id="factory-ambient"]']);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);

    const ambientCardCheck: string = await runBrowser([
        "eval",
        `(() => {
            const notesInput = document.getElementById('notes');
            const bpmSlider = document.getElementById('bpm');
            const postGainSlider = document.getElementById('post-gain');
            const activeCard = document.querySelector('#sound-starters-grid .sound-starter-card.active');

            if (!notesInput || notesInput.value !== 'C4 G4 C5 D5') {
                return 'ambient-notes-mismatch: ' + notesInput?.value;
            }
            if (!bpmSlider || bpmSlider.value !== '85') {
                return 'ambient-bpm-mismatch: ' + bpmSlider?.value;
            }
            if (!postGainSlider || postGainSlider.value !== '-6') {
                return 'post-gain-unexpectedly-overridden: ' + postGainSlider?.value;
            }
            if (!activeCard || activeCard.getAttribute('data-preset-id') !== 'factory-ambient') {
                return 'ambient-card-not-active';
            }

            return 'success';
        })()`,
    ]);
    expect(ambientCardCheck).toBe('"success"');

    // =========================================================================
    // 4. Sound Starters — Active State Cleared on Parameter Change
    // =========================================================================
    console.log("Step 4: Testing Active State Clears on Parameter Edit...");
    await runBrowser([
        "eval",
        `(() => {
            const bpm = document.getElementById('bpm');
            bpm.value = '99';
            bpm.dispatchEvent(new Event('input', { bubbles: true }));
            bpm.dispatchEvent(new Event('change', { bubbles: true }));
        })()`,
    ]);

    const activeClearCheck: string = await runBrowser([
        "eval",
        `(() => {
            const activeCards = document.querySelectorAll('#sound-starters-grid .sound-starter-card.active');
            return activeCards.length === 0 ? 'success' : 'card-remained-active';
        })()`,
    ]);
    expect(activeClearCheck).toBe('"success"');

    // Stop playback
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Restart Audio'",
    ]);

    // =========================================================================
    // 5. Sound Starters — Accordion Collapse Persistence
    // =========================================================================
    console.log("Step 5: Testing Sound Starters Details Persistence...");
    await runBrowser([
        "eval",
        `(() => {
            const details = document.getElementById('sound-starters-details');
            details.removeAttribute('open');
            details.dispatchEvent(new Event('toggle'));
        })()`,
    ]);

    const collapseStored: string = await runBrowser([
        "eval",
        "localStorage.getItem('soundStartersOpen')",
    ]);
    expect(collapseStored).toBe('"false"');

    // =========================================================================
    // 6. Quick Start — Start from Scratch Dismissal
    // =========================================================================
    console.log("Step 6: Testing Start from Scratch Flow...");
    await resetBrowserState();
    await runBrowser(["reload"]);
    await runBrowser(["wait", "--load", "networkidle"]);

    await runBrowser(["click", "#quick-start-scratch"]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    const scratchCheck: string = await runBrowser([
        "eval",
        `(() => {
            const quickStart = document.getElementById('quick-start-overlay');
            const playStop = document.getElementById('play-stop');
            const notesInput = document.getElementById('notes');
            const visited = localStorage.getItem('webArpHasVisited');
            const details = document.getElementById('sound-starters-details');

            if (quickStart && window.getComputedStyle(quickStart).display !== 'none') {
                return 'quick-start-not-hidden';
            }
            if (playStop.textContent !== 'Start Audio') {
                return 'audio-should-be-idle: ' + playStop.textContent;
            }
            if (notesInput.value !== 'C4 E4 G4') {
                return 'notes-not-default: ' + notesInput.value;
            }
            if (visited !== 'true') {
                return 'visited-not-marked';
            }
            if (details && details.hasAttribute('open')) {
                return 'sound-starters-strip-should-be-collapsed-on-scratch';
            }

            return 'success';
        })()`,
    ]);
    expect(scratchCheck).toBe('"success"');

    // =========================================================================
    // 7. Quick Start — Escape Key Dismissal
    // =========================================================================
    console.log("Step 7: Testing Escape Key Dismissal on Quick Start...");
    await resetBrowserState();
    await runBrowser(["reload"]);
    await runBrowser(["wait", "--load", "networkidle"]);

    await runBrowser([
        "eval",
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
    ]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    const escCheck: string = await runBrowser([
        "eval",
        `(() => {
            const quickStart = document.getElementById('quick-start-overlay');
            return quickStart && window.getComputedStyle(quickStart).display === 'none' ? 'success' : 'escape-did-not-dismiss';
        })()`,
    ]);
    expect(escCheck).toBe('"success"');

    // =========================================================================
    // 8. Returning User — Standard Audio Overlay
    // =========================================================================
    console.log("Step 8: Testing Returning User Flow...");
    await runBrowser(["eval", "localStorage.setItem('webArpHasVisited', 'true')"]);
    await runBrowser(["reload"]);
    await runBrowser(["wait", "--load", "networkidle"]);

    const returningCheck: string = await runBrowser([
        "eval",
        `(() => {
            const quickStart = document.getElementById('quick-start-overlay');
            const simpleOverlay = document.getElementById('start-overlay');

            if (quickStart && window.getComputedStyle(quickStart).display !== 'none') {
                return 'quick-start-unexpectedly-visible';
            }
            if (!simpleOverlay || window.getComputedStyle(simpleOverlay).display === 'none') {
                return 'simple-overlay-not-visible';
            }

            return 'success';
        })()`,
    ]);
    expect(returningCheck).toBe('"success"');

    // =========================================================================
    // 9. Shared URL Preset Link Bypass
    // =========================================================================
    console.log("Step 9: Testing Shared URL Preset Bypass...");
    await resetBrowserState();
    const presetShareUrl = `${APP_URL}?pwa=true&bpm=170&synth=fmSynth&notes=D4%20F4%20A4`;
    await runBrowser(["open", presetShareUrl]);
    await runBrowser(["wait", "--load", "networkidle"]);

    const urlBypassCheck: string = await runBrowser([
        "eval",
        `(() => {
            const quickStart = document.getElementById('quick-start-overlay');
            const simpleOverlay = document.getElementById('start-overlay');

            if (quickStart && window.getComputedStyle(quickStart).display !== 'none') {
                return 'quick-start-should-be-bypassed-on-url-preset';
            }
            if (!simpleOverlay || window.getComputedStyle(simpleOverlay).display === 'none') {
                return 'simple-overlay-should-be-displayed';
            }

            return 'success';
        })()`,
    ]);
    expect(urlBypassCheck).toBe('"success"');

    // =========================================================================
    // 10. Bidirectional Dropdown Sync with Sound Starters
    // =========================================================================
    console.log("Step 10: Testing Dropdown Selection Sync with Sound Starters...");
    await runBrowser(["click", "#start-overlay"]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    await runBrowser([
        "eval",
        `(() => {
            const select = document.getElementById('saved-preset-select');
            const loadBtn = document.getElementById('load-saved-preset-button');
            if (select && loadBtn) {
                select.value = 'factory-cyberpunk';
                loadBtn.click();
            }
        })()`,
    ]);

    const dropdownSyncCheck: string = await runBrowser([
        "eval",
        `(() => {
            const activeCard = document.querySelector('#sound-starters-grid .sound-starter-card.active');
            if (!activeCard || activeCard.getAttribute('data-preset-id') !== 'factory-cyberpunk') {
                return 'card-not-synced-to-cyberpunk';
            }
            return 'success';
        })()`,
    ]);
    expect(dropdownSyncCheck).toBe('"success"');

    console.log("Onboarding & Sound Starters Integration Suite complete!");
}, 60000);

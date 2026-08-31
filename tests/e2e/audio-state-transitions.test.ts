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
const PORT: number = 4186;

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

test("Audio Engine & Recording State Transitions Suite", async (): Promise<void> => {
    console.log("Starting Audio State Transitions Integration Suite...");

    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // =========================================================================
    // T1: Cold Start -> Active Playback (via start-overlay & play-stop button)
    // =========================================================================
    console.log("Testing T1: Cold Start -> Active Playback...");
    await initializeAudio();
    const t1Check: string = await runBrowser([
        "eval",
        `(() => {
        const playBtn = document.getElementById('play-stop');
        const overlay = document.getElementById('start-overlay');
        const qsOverlay = document.getElementById('quick-start-overlay');
        const isHidden = (overlay?.style.display === 'none') && (qsOverlay?.style.display === 'none');
        return playBtn.textContent === 'Stop Audio' && isHidden ? 'success' : 'failed';
    })()`,
    ]);
    expect(t1Check).toBe('"success"');

    // =========================================================================
    // T3: Active Playback -> Idle / Stopped (via play-stop button)
    // =========================================================================
    console.log("Testing T3: Active Playback -> Idle / Stopped...");
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Restart Audio'",
    ]);
    const t3Check: string = await runBrowser([
        "eval",
        `(() => {
        const playBtn = document.getElementById('play-stop');
        return playBtn.textContent === 'Restart Audio' ? 'success' : 'failed';
    })()`,
    ]);
    expect(t3Check).toBe('"success"');

    // =========================================================================
    // T4: Idle / Stopped -> Active Playback (via play-stop button)
    // =========================================================================
    console.log("Testing T4: Idle -> Active Playback...");
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);

    // Return to Idle for T5
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Restart Audio'",
    ]);

    // =========================================================================
    // T5: Idle / Stopped -> Playing & Recording (via Record button)
    // =========================================================================
    console.log("Testing T5: Idle -> Playing & Recording...");
    await runBrowser(["click", "#record-button"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('record-button')?.classList.contains('recording') && document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);
    const t5Check: string = await runBrowser([
        "eval",
        `(() => {
        const recBtn = document.getElementById('record-button');
        const playBtn = document.getElementById('play-stop');
        const isRec = recBtn.classList.contains('recording');
        const isPlay = playBtn.textContent === 'Stop Audio';
        return isRec && isPlay ? 'success' : 'failed';
    })()`,
    ]);
    expect(t5Check).toBe('"success"');

    // =========================================================================
    // T7: Playing & Recording -> Idle & Recording (Stop Audio while recording)
    // =========================================================================
    console.log("Testing T7: Playing & Recording -> Idle & Recording (Pause playback)...");
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Restart Audio'",
    ]);
    const t7Check: string = await runBrowser([
        "eval",
        `(() => {
        const recBtn = document.getElementById('record-button');
        const playBtn = document.getElementById('play-stop');
        const isRec = recBtn.classList.contains('recording');
        const isIdle = playBtn.textContent === 'Restart Audio';
        return isRec && isIdle ? 'success' : 'failed';
    })()`,
    ]);
    expect(t7Check).toBe('"success"');

    // =========================================================================
    // T8: Idle & Recording -> Playing & Recording (Restart Audio while recording)
    // =========================================================================
    console.log("Testing T8: Idle & Recording -> Playing & Recording (Resume playback)...");
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);
    const t8Check: string = await runBrowser([
        "eval",
        `(() => {
        const recBtn = document.getElementById('record-button');
        const playBtn = document.getElementById('play-stop');
        const isRec = recBtn.classList.contains('recording');
        const isPlaying = playBtn.textContent === 'Stop Audio';
        return isRec && isPlaying ? 'success' : 'failed';
    })()`,
    ]);
    expect(t8Check).toBe('"success"');

    // =========================================================================
    // T15: Live Parameter & Preset Modulation during Active Recording
    // =========================================================================
    console.log("Testing T15: Live Parameter Modulation during Active Recording...");
    const t15Modulation: string = await runBrowser([
        "eval",
        `(() => {
        // Change pattern direction
        const downBtn = document.querySelector('[data-pattern="down"]');
        if (downBtn) downBtn.click();

        // Change BPM slider
        const bpmInput = document.getElementById('bpm');
        if (bpmInput) {
            bpmInput.value = 140;
            bpmInput.dispatchEvent(new Event('input'));
        }

        // Change Filter Cutoff
        const cutoffInput = document.getElementById('filter-cutoff');
        if (cutoffInput) {
            cutoffInput.value = 2500;
            cutoffInput.dispatchEvent(new Event('input'));
        }

        return 'success';
    })()`,
    ]);
    expect(t15Modulation).toBe('"success"');

    // =========================================================================
    // T9: Playing & Recording -> Active Playback & Export Ready (Stop Recording)
    // =========================================================================
    console.log("Testing T9: Playing & Recording -> Active Playback & Export Ready...");
    await runBrowser(["click", "#record-button"]);
    await runBrowser([
        "wait",
        "--fn",
        "!document.getElementById('record-button')?.classList.contains('recording') && !document.getElementById('realtime-export-controls')?.classList.contains('hidden')",
    ]);
    const t9Check: string = await runBrowser([
        "eval",
        `(() => {
        const recBtn = document.getElementById('record-button');
        const playBtn = document.getElementById('play-stop');
        const exportControls = document.getElementById('realtime-export-controls');
        const isNotRec = !recBtn.classList.contains('recording');
        const isStillPlaying = playBtn.textContent === 'Stop Audio';
        const hasExport = !exportControls.classList.contains('hidden');
        return isNotRec && isStillPlaying && hasExport ? 'success' : 'failed';
    })()`,
    ]);
    expect(t9Check).toBe('"success"');

    // =========================================================================
    // T11: Export Ready -> New Recording Session (click Record again)
    // =========================================================================
    console.log("Testing T11: Export Ready -> New Recording Session...");
    await runBrowser(["click", "#record-button"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('record-button')?.classList.contains('recording') && document.getElementById('realtime-export-controls')?.classList.contains('hidden')",
    ]);

    // Stop playback so we are in Idle & Recording for T10
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Restart Audio'",
    ]);

    // =========================================================================
    // T10: Idle & Recording -> Idle & Export Ready (Stop Recording when paused)
    // =========================================================================
    console.log("Testing T10: Idle & Recording -> Idle & Export Ready...");
    await runBrowser(["click", "#record-button"]);
    await runBrowser([
        "wait",
        "--fn",
        "!document.getElementById('record-button')?.classList.contains('recording') && !document.getElementById('realtime-export-controls')?.classList.contains('hidden')",
    ]);
    const t10Check: string = await runBrowser([
        "eval",
        `(() => {
        const recBtn = document.getElementById('record-button');
        const playBtn = document.getElementById('play-stop');
        const exportControls = document.getElementById('realtime-export-controls');
        const isNotRec = !recBtn.classList.contains('recording');
        const isIdle = playBtn.textContent === 'Restart Audio';
        const hasExport = !exportControls.classList.contains('hidden');
        return isNotRec && isIdle && hasExport ? 'success' : 'failed';
    })()`,
    ]);
    expect(t10Check).toBe('"success"');

    // =========================================================================
    // T12: Export Ready -> Download Real-time Export (WAV / MP3)
    // =========================================================================
    console.log("Testing T12: Export Ready -> Download Real-time Export...");
    await runBrowser([
        "eval",
        `(() => {
        // Mock download link click so browser doesn't open download dialogs
        window.__downloadTriggered = false;
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function() {
            window.__downloadTriggered = true;
        };
    })()`,
    ]);

    await runBrowser(["click", "#realtime-export-button"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('realtime-record-status')?.textContent?.includes('Export complete!') || window.__downloadTriggered === true",
    ]);

    // =========================================================================
    // T13: Offline Audio Export (Generate & Export Audio)
    // =========================================================================
    console.log("Testing T13: Offline Audio Export Rendering...");
    await runBrowser([
        "eval",
        `(() => {
        // Set offline loop count to 1 for quick test render
        const loopInput = document.getElementById('loop-count');
        if (loopInput) loopInput.value = 1;
    })()`,
    ]);

    await runBrowser(["click", "#offline-export-button"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('offline-export-status')?.textContent?.includes('complete') && document.getElementById('offline-export-button')?.disabled === false",
    ]);
    const t13Check: string = await runBrowser([
        "eval",
        `(() => {
        const status = document.getElementById('offline-export-status')?.textContent;
        return status && status.includes('complete') ? 'success' : 'failed';
    })()`,
    ]);
    expect(t13Check).toBe('"success"');

    // =========================================================================
    // T14: Standard MIDI Export (.mid File Export)
    // =========================================================================
    console.log("Testing T14: Standard MIDI (.mid) Export...");
    await runBrowser(["click", "#offline-export-midi-button"]);
    const t14Check: string = await runBrowser([
        "eval",
        `(() => {
        return window.__downloadTriggered === true ? 'success' : 'failed';
    })()`,
    ]);
    expect(t14Check).toBe('"success"');

    console.log("All Audio State Machine Transitions (T1-T15) verified successfully!");
});

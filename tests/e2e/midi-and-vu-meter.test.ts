import { test, expect, beforeAll, afterAll } from "bun:test";
import { type Subprocess } from "bun";
import {
    startTestServer,
    runBrowser,
    waitForPwaReady,
    initializeAudio,
    resetBrowserState,
    cleanupProcesses,
    closeBrowser,
} from "../test-helpers";

let serverProcess: Subprocess | null = null;
const PORT: number = 4183;
const APP_URL: string = `http://127.0.0.1:${PORT}/index.html`;

beforeAll(async () => {
    serverProcess = await startTestServer(PORT);
});

afterAll(async () => {
    await closeBrowser();
    cleanupProcesses();
});

test("MIDI Export & Real-Time Peak Meter Suite", async (): Promise<void> => {
    console.log("Starting MIDI Export & Real-Time Peak Meter Integration Suite...");

    // 1. Wait for PWA ready state
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    // 1b. Reset browser state to a clean slate
    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Initialize AudioContext by clicking start audio overlay
    console.log("Step 2: Initializing audio...");
    await initializeAudio();

    // 3. Test Standard MIDI File (.mid) Pattern Export via Button Click
    console.log("Step 3: Testing Standard MIDI File Pattern Export...");
    const midiExportResult: string = await runBrowser([
        "eval",
        `(async () => {
        const midiButton = document.getElementById("offline-export-midi-button");
        if (!midiButton) return "midi-button-missing";

        // Intercept download blob creation and link trigger
        let capturedBlob = null;
        let capturedFilename = null;
        const originalCreateObjectURL = URL.createObjectURL;
        const originalClick = HTMLAnchorElement.prototype.click;

        URL.createObjectURL = function (blob) {
            capturedBlob = blob;
            return originalCreateObjectURL.call(URL, blob);
        };
        HTMLAnchorElement.prototype.click = function () {
            if (this.download) {
                capturedFilename = this.download;
            }
        };

        try {
            midiButton.click();
            await new Promise((resolve) => setTimeout(resolve, 200));

            if (!capturedFilename) return "download-not-triggered";
            if (!capturedFilename.endsWith(".mid")) {
                return "invalid-filename:" + capturedFilename;
            }

            const midiBlob = capturedBlob;
            if (!midiBlob || !(midiBlob instanceof Blob)) return "invalid-midi-blob";
            if (midiBlob.type !== "audio/midi") return "invalid-midi-mime:" + midiBlob.type;
            if (midiBlob.size < 20) return "midi-size-too-small:" + midiBlob.size;

            const arrayBuffer = await midiBlob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            // Verify 'MThd' header signature (0x4D, 0x54, 0x68, 0x64)
            if (bytes[0] !== 0x4d || bytes[1] !== 0x54 || bytes[2] !== 0x68 || bytes[3] !== 0x64) {
                return "missing-mthd-header";
            }

            // Verify format 0, 1 track, 480 PPQ
            if (bytes[8] !== 0 || bytes[9] !== 0 || bytes[10] !== 0 || bytes[11] !== 1) {
                return "invalid-header-fields";
            }

            // Verify 'MTrk' track signature
            if (bytes[14] !== 0x4d || bytes[15] !== 0x54 || bytes[16] !== 0x72 || bytes[17] !== 0x6b) {
                return "missing-mtrk-chunk";
            }

            return "success";
        } finally {
            URL.createObjectURL = originalCreateObjectURL;
            HTMLAnchorElement.prototype.click = originalClick;
        }
    })()`,
    ]);
    expect(midiExportResult).toBe('"success"');

    // 4. Test Real-Time VU / Peak Meter UI & Clip Reset
    console.log("Step 4: Testing Real-Time VU Meter & Clipping Indicator...");
    const vuMeterResult: string = await runBrowser([
        "eval",
        `(async () => {
        const vuBar = document.getElementById("vu-meter-bar");
        const vuDb = document.getElementById("vu-db-value");
        const clipBtn = document.getElementById("vu-clip-indicator");

        if (!vuBar || !vuDb || !clipBtn) return "vu-elements-missing";

        // Check a11y accessibility attributes
        if (vuBar.getAttribute("role") !== "meter") return "missing-meter-role";
        if (!vuBar.getAttribute("aria-label")) return "missing-meter-aria-label";
        if (clipBtn.getAttribute("aria-pressed") !== "false") return "missing-initial-aria-pressed";

        // Start playback
        await window.__WEB_ARP_TEST__.play();
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Get visualizer animation update
        const vis = window.__WEB_ARP_TEST__.getVisualizer();
        vis.runUiUpdate();

        // Verify that meter bar or db readout responded to audio playback
        const rawDbText = vuDb.textContent || "";
        const barWidth = vuBar.style.width || "0%";
        if (barWidth === "0%" && rawDbText === "-inf dB") {
            return "meter-failed-to-respond";
        }

        // Test clipping latch behavior with unsmoothed peakAnalyser and verify aria-valuenow clamping
        const originalPeakAnalyser = window.audioEngine?.peakAnalyser;
        if (originalPeakAnalyser) {
            const origGetVal = originalPeakAnalyser.getValue;
            originalPeakAnalyser.getValue = () => new Float32Array([1.05]); // Full scale peak
            vis.runUiUpdate();
            originalPeakAnalyser.getValue = origGetVal;
        }

        // Verify ARIA valuenow does not exceed declared aria-valuemax of 0
        const ariaValueNow = parseFloat(vuBar.getAttribute("aria-valuenow") || "0");
        if (ariaValueNow > 0) return "aria-valuenow-exceeds-max:" + ariaValueNow;

        if (!vis.isClipped) return "clip-failed-to-latch";
        if (clipBtn.getAttribute("aria-pressed") !== "true") return "clip-btn-aria-pressed-not-true";

        // Verify clip indicator click resets latched clip
        clipBtn.click();
        if (vis.isClipped) return "clip-failed-to-reset";
        if (clipBtn.getAttribute("aria-pressed") !== "false") return "clip-btn-aria-pressed-not-reset";

        // Stop playback
        await window.__WEB_ARP_TEST__.stop();
        return "success";
    })()`,
    ]);
    expect(vuMeterResult).toBe('"success"');

    console.log("MIDI Export & Real-Time Peak Meter Integration Suite complete!");
}, 30000);

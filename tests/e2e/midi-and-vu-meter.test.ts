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

    // 4. Test Real-Time VU / Peak Meter UI, Tooltip, & Clip Reset
    console.log("Step 4: Testing Real-Time VU Meter & Clipping Indicator...");
    const vuMeterResult: string = await runBrowser([
        "eval",
        `(async () => {
        const vuBar = document.getElementById("vu-meter-bar");
        const vuDb = document.getElementById("vu-db-value");
        const clipBtn = document.getElementById("vu-clip-indicator");
        const clipTooltip = document.getElementById("vu-clip-tooltip");
        const infoBtn = document.getElementById("vu-info-button");
        const infoTooltip = document.getElementById("vu-info-tooltip");

        if (!vuBar || !vuDb || !clipBtn || !clipTooltip || !infoBtn || !infoTooltip) return "vu-elements-missing";

        // Ensure playback is stopped to test clean idle state
        await window.__WEB_ARP_TEST__.stop();
        const vis = window.__WEB_ARP_TEST__.getVisualizer();
        vis.stopUiLoop();

        // Check a11y accessibility attributes & initial idle state
        if (vuBar.getAttribute("role") !== "meter") return "missing-meter-role";
        if (vuBar.getAttribute("aria-label") !== "Final audio output peak level") return "invalid-meter-aria-label";
        if (vuBar.getAttribute("aria-valuenow") !== "-60") return "invalid-initial-aria-valuenow:" + vuBar.getAttribute("aria-valuenow");
        if (vuBar.getAttribute("aria-valuetext") !== "Idle") return "invalid-initial-aria-valuetext:" + vuBar.getAttribute("aria-valuetext");
        if (vuDb.textContent?.trim() !== "-- dB") return "invalid-initial-db-text:" + vuDb.textContent;
        if (clipBtn.getAttribute("aria-pressed") !== "false") return "missing-initial-aria-pressed";
        if (clipBtn.getAttribute("aria-describedby") !== "vu-clip-tooltip") return "missing-clip-aria-describedby";
        if (clipTooltip.getAttribute("role") !== "tooltip") return "missing-clip-tooltip-role";

        // Test hover interaction for clip tooltip (normal state)
        if (!clipTooltip.classList.contains("hidden")) return "clip-tooltip-initially-visible";
        clipBtn.dispatchEvent(new MouseEvent("mouseenter"));
        if (clipTooltip.classList.contains("hidden")) return "clip-tooltip-hover-show-failed";
        if (clipTooltip.textContent?.trim() !== "No clipping detected") return "invalid-clip-tooltip-text:" + clipTooltip.textContent;
        clipBtn.dispatchEvent(new MouseEvent("mouseleave"));
        if (!clipTooltip.classList.contains("hidden")) return "clip-tooltip-hover-hide-failed";

        // Check info tooltip accessibility attributes
        if (infoTooltip.getAttribute("role") !== "tooltip") return "missing-tooltip-role";
        if (infoBtn.getAttribute("aria-describedby") !== "vu-info-tooltip") return "missing-info-aria-describedby";
        if (infoBtn.getAttribute("aria-label") !== "Final Audio Output info") return "invalid-info-aria-label";

        // Test hover interaction for info tooltip
        if (!infoTooltip.classList.contains("hidden")) return "tooltip-initially-visible";
        infoBtn.dispatchEvent(new MouseEvent("mouseenter"));
        if (infoTooltip.classList.contains("hidden")) return "tooltip-hover-show-failed";
        if (infoBtn.getAttribute("aria-expanded") !== "true") return "tooltip-aria-expanded-not-true";

        infoBtn.dispatchEvent(new MouseEvent("mouseleave"));
        if (!infoTooltip.classList.contains("hidden")) return "tooltip-hover-hide-failed";
        if (infoBtn.getAttribute("aria-expanded") !== "false") return "tooltip-aria-expanded-not-false";

        // Test focus & escape key dismissal
        infoBtn.focus();
        if (infoTooltip.classList.contains("hidden")) return "tooltip-focus-show-failed";
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        if (!infoTooltip.classList.contains("hidden")) return "tooltip-escape-hide-failed";

        // Start playback
        await window.__WEB_ARP_TEST__.play();
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Get visualizer animation update
        vis.runUiUpdate();

        // Verify that meter bar or db readout responded to audio playback
        const rawDbText = vuDb.textContent || "";
        const barWidth = vuBar.style.width || "0%";
        if (barWidth === "0%" && rawDbText === "-- dB") {
            return "meter-failed-to-respond";
        }

        const activeAriaValueText = vuBar.getAttribute("aria-valuetext") || "";
        if (!activeAriaValueText.includes("dBFS")) {
            return "missing-active-aria-valuetext:" + activeAriaValueText;
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
        if (clipTooltip.textContent?.trim() !== "Signal clipped — Click to reset") return "invalid-clipped-tooltip-text:" + clipTooltip.textContent;

        // Verify clip indicator click resets latched clip
        clipBtn.click();
        if (vis.isClipped) return "clip-failed-to-reset";
        if (clipBtn.getAttribute("aria-pressed") !== "false") return "clip-btn-aria-pressed-not-reset";
        if (clipTooltip.textContent?.trim() !== "No clipping detected") return "clip-tooltip-not-reset:" + clipTooltip.textContent;

        // Stop playback and verify return to idle
        await window.__WEB_ARP_TEST__.stop();
        vis.stopUiLoop();
        if (vuDb.textContent?.trim() !== "-- dB") return "stop-db-not-idle:" + vuDb.textContent;
        if (vuBar.getAttribute("aria-valuetext") !== "Idle") return "stop-aria-valuetext-not-idle";

        return "success";
    })()`,
    ]);
    expect(vuMeterResult).toBe('"success"');

    console.log("MIDI Export & Real-Time Peak Meter Integration Suite complete!");
}, 30000);

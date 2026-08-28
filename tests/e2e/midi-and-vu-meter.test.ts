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

    // 3. Test Standard MIDI File (.mid) Pattern Export
    console.log("Step 3: Testing Standard MIDI File Pattern Export...");
    const midiExportResult: string = await runBrowser([
        "eval",
        `(async () => {
        const midiButton = document.getElementById("offline-export-midi-button");
        if (!midiButton) return "midi-button-missing";

        // Export blob via test hook
        const midiBlob = window.__WEB_ARP_TEST__.exportMidiBlob();
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

        // Start playback
        await window.__WEB_ARP_TEST__.play();
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Get visualizer animation update
        const vis = window.__WEB_ARP_TEST__.getVisualizer();
        vis.runUiUpdate();

        // Verify clip indicator click resets latched clip
        clipBtn.click();
        if (vis.isClipped) return "clip-failed-to-reset";

        // Stop playback
        await window.__WEB_ARP_TEST__.stop();
        return "success";
    })()`,
    ]);
    expect(vuMeterResult).toBe('"success"');

    console.log("MIDI Export & Real-Time Peak Meter Integration Suite complete!");
}, 30000);

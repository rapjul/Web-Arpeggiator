import { test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { startTestServer, runBrowser, waitForPwaReady, resetBrowserState, cleanupProcesses } from "./test-helpers";

/**
 * References the background server process.
 * @type {Subprocess|null}
 */
let serverProcess: Subprocess | null = null;

/**
 * The port number for the test server instance.
 * @type {number}
 */
const PORT: number = 4180;

/**
 * The root URL of the running application.
 * @type {string}
 */
const APP_URL: string = `http://127.0.0.1:${PORT}/index.html`;

beforeAll(async (): Promise<void> => {
    // Clean up any stale browser processes from previous runs to release connection locks
    await spawn(["pkill", "-9", "-f", "agent-browser-chrome"]).exited;
    await spawn(["pkill", "-9", "-f", "agent-browser"]).exited;
    serverProcess = await startTestServer(PORT);
});

afterAll(async (): Promise<void> => {
    cleanupProcesses();
    await spawn(["pkill", "-9", "-f", "agent-browser-chrome"]).exited;
    await spawn(["pkill", "-9", "-f", "agent-browser"]).exited;
});

test("Preset Sharing and Parameter Restoration Integration Suite", async (): Promise<void> => {
    console.log("Starting Preset Sharing Integration Suite...");
    
    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);
    
    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Verify Preset Sharing Link Serialization
    console.log("Step 2: Testing preset sharing serialization (clicking 'Copy Share Link')...");
    const serializationResult: string = await runBrowser(["eval", `(async () => {
        const shareBtn = document.getElementById('share-preset-button');
        if (!shareBtn) {
            return 'missing-button';
        }
        
        if (window.__WEB_ARP_TEST__) {
            window.__WEB_ARP_TEST__.lastSharedUrl = null;
        }
        
        shareBtn.click();
        
        const lastUrl = window.__WEB_ARP_TEST__?.lastSharedUrl;
        if (!lastUrl) {
            return 'missing-url';
        }
        
        const url = new URL(lastUrl);
        if (!url.searchParams.has('bpm') || !url.searchParams.has('notes') || !url.searchParams.has('synth')) {
            return 'missing-params: ' + lastUrl;
        }
        
        return 'success';
    })()`]);
    expect(serializationResult).toBe('"success"');

    // 3. Verify Deserialization and Restoration from URL
    console.log("Step 3: Testing restoration of preset from custom URL query parameters...");
    const customUrl = `${APP_URL}?pwa=true&bpm=195&notes=D4%20F4%20A4&synth=fmSynth&wave=square&harm=2.5&mod=15.0&quant=true&root=D&scale=minor`;
    
    console.log(`Navigating to: ${customUrl}`);
    await runBrowser(["open", customUrl]);
    await runBrowser(["wait", "--load", "networkidle"]);
    await runBrowser(["wait", "--fn", "window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"]);
    
    console.log("Clicking overlay to initialize AudioContext...");
    await runBrowser(["click", "#start-overlay"]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    const restorationResult: string = await runBrowser(["eval", `(async () => {
        const bpmSlider = document.getElementById('bpm');
        const notesInput = document.getElementById('notes');
        const synthTypeSelect = document.getElementById('synth-type');
        const scaleRootSelect = document.getElementById('scale-root');
        const scaleTypeSelect = document.getElementById('scale-type');
        
        if (bpmSlider.value !== '195') {
            return 'bpm-mismatch: ' + bpmSlider.value;
        }
        if (notesInput.value !== 'D4 F4 A4') {
            return 'notes-mismatch: ' + notesInput.value;
        }
        if (synthTypeSelect.value !== 'fmSynth') {
            return 'synth-mismatch: ' + synthTypeSelect.value;
        }
        if (scaleRootSelect.value !== 'D') {
            return 'root-mismatch: ' + scaleRootSelect.value;
        }
        if (scaleTypeSelect.value !== 'minor') {
            return 'scale-mismatch: ' + scaleTypeSelect.value;
        }
        
        // Also check if Tone is defined on window before checking (which it isn't in Vite scoped build)
        // But the internal app state must have been updated.
        return 'success';
    })()`]);
    expect(restorationResult).toBe('"success"');

    // 4. Verify Out-of-Bounds Parameter Clamping
    console.log("Step 4: Testing parameter boundary clamping...");
    const clampUrl = `${APP_URL}?pwa=true&bpm=999&gain=100&harm=99.9&range=10`;
    
    console.log(`Navigating to: ${clampUrl}`);
    await runBrowser(["open", clampUrl]);
    await runBrowser(["wait", "--load", "networkidle"]);
    await runBrowser(["wait", "--fn", "window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"]);
    
    console.log("Clicking overlay to initialize AudioContext...");
    await runBrowser(["click", "#start-overlay"]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    const clampingResult: string = await runBrowser(["eval", `(async () => {
        const bpmSlider = document.getElementById('bpm');
        const postGainSlider = document.getElementById('post-gain');
        const harmonicitySlider = document.getElementById('harmonicity');
        
        if (bpmSlider.value !== '240') {
            return 'bpm-clamp-failed: ' + bpmSlider.value;
        }
        if (postGainSlider.value !== '0') {
            return 'gain-clamp-failed: ' + postGainSlider.value;
        }
        if (harmonicitySlider.value !== '10') {
            return 'harm-clamp-failed: ' + harmonicitySlider.value;
        }
        
        return 'success';
    })()`]);
    expect(clampingResult).toBe('"success"');
    
    console.log("Preset Sharing Integration Suite complete!");
}, 30000);

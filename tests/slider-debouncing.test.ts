import { test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { startTestServer, runBrowser, waitForPwaReady, initializeAudio, resetBrowserState, cleanupProcesses } from "./test-helpers";

/**
 * References the background server process.
 * @type {Subprocess|null}
 */
let serverProcess: Subprocess | null = null;

/**
 * The port number for the test server instance.
 * @type {number}
 */
const PORT: number = 4182;

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

test("UI Slider Debouncing Verification Suite", async (): Promise<void> => {
    console.log("Starting Slider Debouncing Integration Suite...");
    
    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);
    
    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Initialize Audio playback
    console.log("Step 2: Initializing audio...");
    await initializeAudio();

    // 3. Verify Filter Cutoff Slider Debouncing (16ms)
    console.log("Step 3: Testing Filter Cutoff slider debouncing...");
    const filterDebounceResult: string = await runBrowser(["eval", `(async () => {
        const slider = document.getElementById('filter-cutoff');
        const label = document.getElementById('filter-cutoff-value');
        
        slider.value = '5000';
        slider.dispatchEvent(new Event('input'));
        
        // 1. Label MUST update immediately (synchronously)
        if (label.textContent !== '5000') {
            return 'label-mismatch: ' + label.textContent;
        }
        
        // 2. Tone.js parameter must NOT update immediately
        const immediateToneFreq = window.audioEngine?.filter?.frequency?.value;
        if (immediateToneFreq === 5000) {
            return 'filter-updated-immediately: ' + immediateToneFreq;
        }
        
        // 3. Wait 50ms and verify it is updated
        await new Promise((resolve) => setTimeout(resolve, 50));
        const finalToneFreq = window.audioEngine?.filter?.frequency?.value;
        if (finalToneFreq !== 5000) {
            return 'filter-not-updated-after-debounce: ' + finalToneFreq;
        }
        
        return 'success';
    })()`]);
    expect(filterDebounceResult).toBe('"success"');

    // 4. Verify BPM Slider Debouncing (16ms)
    console.log("Step 4: Testing BPM slider debouncing...");
    const bpmDebounceResult: string = await runBrowser(["eval", `(async () => {
        const slider = document.getElementById('bpm');
        const label = document.getElementById('bpm-value');
        
        slider.value = '180';
        slider.dispatchEvent(new Event('input'));
        
        // Label updates immediately
        if (label.textContent !== '180') {
            return 'bpm-label-mismatch: ' + label.textContent;
        }
        
        // Tone.js BPM must not update immediately
        const transport = window.__WEB_ARP_TEST__?.Tone?.Transport;
        if (!transport) {
            return 'missing-transport';
        }
        const immediateBpm = Math.round(transport.bpm.value);
        if (immediateBpm === 180) {
            return 'bpm-updated-immediately: ' + immediateBpm;
        }
        
        // Wait 50ms and verify
        await new Promise((resolve) => setTimeout(resolve, 50));
        const finalBpm = Math.round(transport.bpm.value);
        if (finalBpm !== 180) {
            return 'bpm-not-updated-after-debounce: ' + finalBpm;
        }
        
        return 'success';
    })()`]);
    expect(bpmDebounceResult).toBe('"success"');

    // 5. Verify Gate Slider Debouncing (50ms)
    console.log("Step 5: Testing Gate slider debouncing (50ms)...");
    const gateDebounceResult: string = await runBrowser(["eval", `(async () => {
        const slider = document.getElementById('gate');
        const label = document.getElementById('gate-value');
        
        const oldPattern = window.arpPattern;
        slider.value = '0.35';
        slider.dispatchEvent(new Event('input'));
        
        // Label updates immediately
        if (label.textContent !== '0.35') {
            return 'gate-label-mismatch: ' + label.textContent;
        }
        
        // Wait 20ms (less than 50ms debounce) - should still not be updated
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (window.arpPattern !== oldPattern) {
            return 'gate-updated-too-early';
        }
        
        // Wait another 60ms (total 80ms, greater than 50ms debounce)
        await new Promise((resolve) => setTimeout(resolve, 60));
        if (window.arpPattern === oldPattern) {
            return 'gate-not-updated-after-debounce';
        }
        
        return 'success';
    })()`]);
    expect(gateDebounceResult).toBe('"success"');
    
    console.log("Slider Debouncing Verification Suite complete!");
}, 30000);

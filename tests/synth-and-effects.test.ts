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
const PORT: number = 4175;

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

test("Synthesizer & Audio Effects Chain Suite", async (): Promise<void> => {
    console.log("Starting Synthesizer and Effects Integration Suite...");
    
    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);
    
    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Initialize Audio playback
    console.log("Step 2: Initializing audio...");
    await initializeAudio();

    // 3. Verify Synthesizer Switching and DOM view updates
    console.log("Step 3: Testing switching synth types...");
    const switchSynthResult: string = await runBrowser(["eval", `(async () => {
        const sel = document.getElementById('synth-type');
        const adv = document.getElementById('advanced-synth-params');
        
        // Switch to FM Synth
        sel.value = 'fmSynth';
        sel.dispatchEvent(new Event('change'));
        
        // Assert FM synth UI elements are visible and settings updated
        if (adv.classList.contains('hidden')) {
            return 'fm-params-hidden';
        }
        if (window.__WEB_ARP_TEST__.getCurrentSettings().synthType !== 'fmSynth') {
            return 'incorrect-synth-type: ' + window.__WEB_ARP_TEST__.getCurrentSettings().synthType;
        }
        return 'success';
    })()`]);
    expect(switchSynthResult).toBe('"success"');

    // 4. Verify synthesis parameters updates
    console.log("Step 4: Testing synthesis sliders...");
    const synthesisResult: string = await runBrowser(["eval", `(async () => {
        const harm = document.getElementById('harmonicity');
        harm.value = 5.5;
        harm.dispatchEvent(new Event('input'));
        harm.dispatchEvent(new Event('change'));

        const mod = document.getElementById('modulation-index');
        mod.value = 22.4;
        mod.dispatchEvent(new Event('input'));
        mod.dispatchEvent(new Event('change'));

        // Assert values updated in setting model
        const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
        if (settings.harmonicity !== 5.5) {
            return 'incorrect-harmonicity: ' + settings.harmonicity;
        }
        if (settings.modulationIndex !== 22.4) {
            return 'incorrect-mod-index: ' + settings.modulationIndex;
        }
        return 'success';
    })()`]);
    expect(synthesisResult).toBe('"success"');

    // 5. Verify Envelope (ADSR) adjustments and direct Tone.js state propagation
    console.log("Step 5: Testing envelope (ADSR) sliders...");
    const envelopeResult: string = await runBrowser(["eval", `(async () => {
        const att = document.getElementById('env-attack');
        att.value = 0.45;
        att.dispatchEvent(new Event('input'));
        att.dispatchEvent(new Event('change'));

        const rel = document.getElementById('env-release');
        rel.value = 2.15;
        rel.dispatchEvent(new Event('input'));
        rel.dispatchEvent(new Event('change'));

        // Verify tone envelope directly
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!window.activeSynth || !window.activeSynth.envelope) {
            return 'missing-active-envelope';
        }
        if (Math.abs(window.activeSynth.envelope.attack - 0.45) > 0.001) {
            return 'attack-mismatch: ' + window.activeSynth.envelope.attack;
        }
        if (Math.abs(window.activeSynth.envelope.release - 2.15) > 0.001) {
            return 'release-mismatch: ' + window.activeSynth.envelope.release;
        }
        return 'success';
    })()`]);
    expect(envelopeResult).toBe('"success"');

    // 6. Verify low-pass filter and audio effects chain updates
    console.log("Step 6: Testing low-pass filter and feedback delay sliders...");
    const filterDelayResult: string = await runBrowser(["eval", `(async () => {
        const cutoff = document.getElementById('filter-cutoff');
        cutoff.value = 2500;
        cutoff.dispatchEvent(new Event('input'));
        cutoff.dispatchEvent(new Event('change'));

        const delayMix = document.getElementById('delay-mix');
        delayMix.value = 0.45;
        delayMix.dispatchEvent(new Event('input'));
        delayMix.dispatchEvent(new Event('change'));

        // Assert setting model matches
        const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
        if (settings.filterCutoff !== 2500) {
            return 'incorrect-cutoff: ' + settings.filterCutoff;
        }
        if (Math.abs(settings.delayMix - 0.45) > 0.001) {
            return 'incorrect-delay-mix: ' + settings.delayMix;
        }
        return 'success';
    })()`]);
    expect(filterDelayResult).toBe('"success"');
    
    console.log("Synthesizer & Audio Effects Chain Integration Suite complete!");
}, 30000);

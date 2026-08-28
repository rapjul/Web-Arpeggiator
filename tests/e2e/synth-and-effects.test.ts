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
    serverProcess = await startTestServer(PORT);
});

afterAll(async (): Promise<void> => {
    await closeBrowser();
    cleanupProcesses();
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
    const switchSynthResult: string = await runBrowser([
        "eval",
        `(async () => {
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
    })()`,
    ]);
    expect(switchSynthResult).toBe('"success"');

    // 4. Verify synthesis parameters updates
    console.log("Step 4: Testing synthesis sliders...");
    const synthesisResult: string = await runBrowser([
        "eval",
        `(async () => {
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
    })()`,
    ]);
    expect(synthesisResult).toBe('"success"');

    // 5. Verify Envelope (ADSR) adjustments and direct Tone.js state propagation
    console.log("Step 5: Testing envelope (ADSR) sliders...");
    const envelopeResult: string = await runBrowser([
        "eval",
        `(async () => {
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
    })()`,
    ]);
    expect(envelopeResult).toBe('"success"');

    // 6. Verify low-pass filter and audio effects chain updates
    console.log("Step 6: Testing low-pass filter and feedback delay sliders...");
    const filterDelayResult: string = await runBrowser([
        "eval",
        `(async () => {
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
    })()`,
    ]);
    expect(filterDelayResult).toBe('"success"');

    // 7. Verify New Synths (MonoSynth, DuoSynth, PluckSynth, MembraneSynth) switching and UI containers
    console.log("Step 7: Testing new synth engines switching and containers...");
    const newSynthsResult: string = await runBrowser([
        "eval",
        `(async () => {
        const sel = document.getElementById('synth-type');
        const monoParams = document.getElementById('mono-synth-params');
        const duoParams = document.getElementById('duo-synth-params');
        const pluckParams = document.getElementById('pluck-synth-params');
        const membraneParams = document.getElementById('membrane-synth-params');

        // 7a. MonoSynth
        sel.value = 'monoSynth';
        sel.dispatchEvent(new Event('change'));
        if (monoParams.classList.contains('hidden')) return 'mono-params-hidden';
        if (window.__WEB_ARP_TEST__.getCurrentSettings().synthType !== 'monoSynth') return 'mono-settings-mismatch';
        const sineBtn = document.querySelector('button[data-wave="sine"]');
        if (sineBtn && sineBtn.disabled) return 'sine-btn-disabled-for-monosynth';

        // 7b. DuoSynth
        sel.value = 'duoSynth';
        sel.dispatchEvent(new Event('change'));
        if (duoParams.classList.contains('hidden')) return 'duo-params-hidden';
        if (window.__WEB_ARP_TEST__.getCurrentSettings().synthType !== 'duoSynth') return 'duo-settings-mismatch';

        // 7c. PluckSynth
        sel.value = 'pluckSynth';
        sel.dispatchEvent(new Event('change'));
        if (pluckParams.classList.contains('hidden')) return 'pluck-params-hidden';
        if (window.__WEB_ARP_TEST__.getCurrentSettings().synthType !== 'pluckSynth') return 'pluck-settings-mismatch';
        if (sineBtn && !sineBtn.disabled) return 'sine-btn-should-be-disabled-for-plucksynth';

        // 7d. MembraneSynth
        sel.value = 'membraneSynth';
        sel.dispatchEvent(new Event('change'));
        if (membraneParams.classList.contains('hidden')) return 'membrane-params-hidden';
        if (window.__WEB_ARP_TEST__.getCurrentSettings().synthType !== 'membraneSynth') return 'membrane-settings-mismatch';
        if (sineBtn && sineBtn.disabled) return 'sine-btn-disabled-for-membranesynth';

        return 'success';
    })()`,
    ]);
    expect(newSynthsResult).toBe('"success"');

    // 8. Verify Studio Effects (Drive, Chorus, Auto-Pan)
    console.log("Step 8: Testing studio effects (Drive, Chorus, Auto-Pan)...");
    const studioEffectsResult: string = await runBrowser([
        "eval",
        `(async () => {
        const drive = document.getElementById('drive-mix');
        drive.value = 0.65;
        drive.dispatchEvent(new Event('input'));
        drive.dispatchEvent(new Event('change'));

        const chorus = document.getElementById('chorus-mix');
        chorus.value = 0.50;
        chorus.dispatchEvent(new Event('input'));
        chorus.dispatchEvent(new Event('change'));

        const pan = document.getElementById('autopan-mix');
        pan.value = 0.75;
        pan.dispatchEvent(new Event('input'));
        pan.dispatchEvent(new Event('change'));

        const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
        if (Math.abs(settings.driveMix - 0.65) > 0.01) return 'incorrect-drive-mix: ' + settings.driveMix;
        if (Math.abs(settings.chorusMix - 0.50) > 0.01) return 'incorrect-chorus-mix: ' + settings.chorusMix;
        if (Math.abs(settings.autoPanMix - 0.75) > 0.01) return 'incorrect-autopan-mix: ' + settings.autoPanMix;

        return 'success';
    })()`,
    ]);
    expect(studioEffectsResult).toBe('"success"');

    console.log("Synthesizer & Audio Effects Chain Integration Suite complete!");
}, 30000);

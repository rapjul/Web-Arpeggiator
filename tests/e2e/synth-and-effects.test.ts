import { afterAll, beforeAll, expect, test } from "bun:test";
import {
    cleanupProcesses,
    closeBrowser,
    initializeAudio,
    resetBrowserState,
    runBrowser,
    startTestServer,
    waitForSessionAutosave,
    waitForPwaReady,
} from "../test-helpers";

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
    await startTestServer(PORT);
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
    await waitForSessionAutosave();

    // 3. Verify Synthesizer Switching and DOM view updates
    console.log("Step 3: Testing switching synth types...");
    const switchSynthResult: string = await runBrowser([
        "eval",
        `(async () => {
        const sel = document.getElementById('synth-type');
        const adv = document.getElementById('advanced-synth-params');
        
        // Switch to FM Synth
        sel.value = 'fmSynth';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Assert FM synth UI elements are visible and the selected option updated.
        if (adv.classList.contains('hidden')) {
            return 'fm-params-hidden';
        }
        if (sel.value !== 'fmSynth') {
            return 'incorrect-synth-type: ' + sel.value;
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
        harm.dispatchEvent(new Event('input', { bubbles: true }));
        harm.dispatchEvent(new Event('change', { bubbles: true }));

        const mod = document.getElementById('modulation-index');
        mod.value = 22.4;
        mod.dispatchEvent(new Event('input', { bubbles: true }));
        mod.dispatchEvent(new Event('change', { bubbles: true }));

        if (harm.value !== '5.5') {
            return 'incorrect-harmonicity: ' + harm.value;
        }
        if (mod.value !== '22.4') {
            return 'incorrect-mod-index: ' + mod.value;
        }
        return 'success';
    })()`,
    ]);
    expect(synthesisResult).toBe('"success"');

    // 5. Verify Envelope (ADSR) control adjustments.
    console.log("Step 5: Testing envelope (ADSR) sliders...");
    const envelopeResult: string = await runBrowser([
        "eval",
        `(async () => {
        const att = document.getElementById('env-attack');
        att.value = 0.45;
        att.dispatchEvent(new Event('input', { bubbles: true }));
        att.dispatchEvent(new Event('change', { bubbles: true }));

        const rel = document.getElementById('env-release');
        rel.value = 2.15;
        rel.dispatchEvent(new Event('input', { bubbles: true }));
        rel.dispatchEvent(new Event('change', { bubbles: true }));

        // Verify values remain after the controller's deferred update.
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (att.value !== '0.45') {
            return 'attack-mismatch: ' + att.value;
        }
        if (rel.value !== '2.15') {
            return 'release-mismatch: ' + rel.value;
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
        cutoff.dispatchEvent(new Event('input', { bubbles: true }));
        cutoff.dispatchEvent(new Event('change', { bubbles: true }));

        const delayMix = document.getElementById('delay-mix');
        delayMix.value = 0.45;
        delayMix.dispatchEvent(new Event('input', { bubbles: true }));
        delayMix.dispatchEvent(new Event('change', { bubbles: true }));

        if (cutoff.value !== '2500') {
            return 'incorrect-cutoff: ' + cutoff.value;
        }
        if (delayMix.value !== '0.45') {
            return 'incorrect-delay-mix: ' + delayMix.value;
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
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (monoParams.classList.contains('hidden')) return 'mono-params-hidden';
        if (sel.value !== 'monoSynth') return 'mono-settings-mismatch';
        const sineBtn = document.querySelector('button[data-wave="sine"]');
        const pluckOverlay = document.getElementById('waveform-pluck-overlay');
        if (sineBtn && sineBtn.disabled) return 'sine-btn-disabled-for-monosynth';
        if (pluckOverlay && !pluckOverlay.classList.contains('hidden')) return 'overlay-visible-for-monosynth';

        // 7b. DuoSynth
        sel.value = 'duoSynth';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (duoParams.classList.contains('hidden')) return 'duo-params-hidden';
        if (sel.value !== 'duoSynth') return 'duo-settings-mismatch';

        // 7c. PluckSynth
        sel.value = 'pluckSynth';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (pluckParams.classList.contains('hidden')) return 'pluck-params-hidden';
        if (sel.value !== 'pluckSynth') return 'pluck-settings-mismatch';
        if (sineBtn && !sineBtn.disabled) return 'sine-btn-should-be-disabled-for-plucksynth';
        if (pluckOverlay && pluckOverlay.classList.contains('hidden')) return 'overlay-hidden-for-plucksynth';

        // 7d. MembraneSynth
        sel.value = 'membraneSynth';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        if (membraneParams.classList.contains('hidden')) return 'membrane-params-hidden';
        if (sel.value !== 'membraneSynth') return 'membrane-settings-mismatch';
        if (sineBtn && sineBtn.disabled) return 'sine-btn-disabled-for-membranesynth';
        if (pluckOverlay && !pluckOverlay.classList.contains('hidden')) return 'overlay-visible-for-membranesynth';

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
        drive.dispatchEvent(new Event('input', { bubbles: true }));
        drive.dispatchEvent(new Event('change', { bubbles: true }));

        const chorus = document.getElementById('chorus-mix');
        chorus.value = 0.50;
        chorus.dispatchEvent(new Event('input', { bubbles: true }));
        chorus.dispatchEvent(new Event('change', { bubbles: true }));

        const pan = document.getElementById('autopan-mix');
        pan.value = 0.75;
        pan.dispatchEvent(new Event('input', { bubbles: true }));
        pan.dispatchEvent(new Event('change', { bubbles: true }));

        if (drive.value !== '0.65') return 'incorrect-drive-mix: ' + drive.value;
        if (chorus.value !== '0.5') return 'incorrect-chorus-mix: ' + chorus.value;
        if (pan.value !== '0.75') return 'incorrect-autopan-mix: ' + pan.value;

        return 'success';
    })()`,
    ]);
    expect(studioEffectsResult).toBe('"success"');

    // Persisted settings are a public application outcome of each control event.
    // Audio-node updates themselves are covered with injected nodes in the
    // controller and audio-engine Vitest suites.
    const persistedControlsResult: string = await runBrowser([
        "eval",
        `(async () => {
            await new Promise((resolve) => setTimeout(resolve, 2200));
            const database = await new Promise((resolve, reject) => {
                const request = indexedDB.open('web-arpeggiator-presets');
                request.addEventListener('success', () => resolve(request.result));
                request.addEventListener('error', () => reject(request.error));
            });
            const transaction = database.transaction('lastSession', 'readonly');
            const request = transaction.objectStore('lastSession').get('current');
            const record = await new Promise((resolve, reject) => {
                request.addEventListener('success', () => resolve(request.result));
                request.addEventListener('error', () => reject(request.error));
            });
            database.close();
            const settings = record?.settings;
            return settings?.harmonicity === 5.5
                && settings?.modulationIndex === 22.4
                && settings?.envAttack === 0.45
                && settings?.envRelease === 2.15
                && settings?.filterCutoff === 2500
                && settings?.delayMix === 0.45
                && settings?.driveMix === 0.65
                && settings?.chorusMix === 0.5
                && settings?.autoPanMix === 0.75
                ? 'success'
                : 'settings-not-persisted';
        })()`,
    ]);
    expect(persistedControlsResult).toBe('"success"');

    console.log("Synthesizer & Audio Effects Chain Integration Suite complete!");
}, 30000);

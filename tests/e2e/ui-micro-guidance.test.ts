import { afterAll, beforeAll, expect, test } from "bun:test";
import {
    cleanupProcesses,
    closeBrowser,
    resetBrowserState,
    runBrowser,
    startTestServer,
    waitForPwaReady,
} from "../test-helpers";

/**
 * The port number for the test server instance.
 * @type {number}
 */
const PORT: number = 4185;

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

test("UI Micro-Guidance Subtitles & Tooltips Suite", async (): Promise<void> => {
    console.log("Starting UI Micro-Guidance Integration Suite...");

    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Verify all slider micro-labels exist and contain descriptive text
    console.log("Step 2: Testing slider micro-guidance subtitles...");
    const sliderGuidanceResult: string = await runBrowser([
        "eval",
        `(() => {
        const expectedSliders = [
            { id: "post-gain", text: "Master output volume" },
            { id: "bpm", text: "Tempo speed" },
            { id: "swing", text: "Adds groove" },
            { id: "interval", text: "Rhythmic step subdivision" },
            { id: "env-attack", text: "Time to reach peak volume" },
            { id: "env-decay", text: "Time to drop from peak" },
            { id: "env-sustain", text: "Held volume level" },
            { id: "env-release", text: "Fade-out duration" },
            { id: "filter-cutoff", text: "Tone brightness" },
            { id: "filter-resonance", text: "Sharpness" },
            { id: "drive-mix", text: "Harmonic saturation" },
            { id: "chorus-mix", text: "Stereo shimmer" },
            { id: "autopan-mix", text: "Left/right stereo" },
            { id: "delay-mix", text: "Echo wet/dry" },
            { id: "reverb-mix", text: "Room acoustic space" },
            { id: "duty-cycle", text: "Pulse width" },
            { id: "harmonicity", text: "Frequency ratio" },
            { id: "modulation-index", text: "Intensity / depth" },
            { id: "mono-cutoff", text: "Starting cutoff frequency" },
            { id: "mono-octaves", text: "Number of octaves modulated" },
            { id: "mono-q", text: "Resonance sharpness" },
            { id: "duo-harm", text: "Harmonic interval ratio" },
            { id: "duo-vibrato", text: "Pitch modulation vibrato" },
            { id: "pluck-dampening", text: "String material dampening" },
            { id: "pluck-resonance", text: "String resonance sustain" },
            { id: "pluck-noise", text: "Initial plectrum pick/pluck" },
            { id: "membrane-pitch-decay", text: "Duration of initial pitch drop" },
            { id: "membrane-octaves", text: "Pitch sweep range" },
            { id: "gate", text: "staccato & punchy" },
            { id: "loop-count", text: "complete pattern cycles" },
        ];

        for (const item of expectedSliders) {
            const el = document.getElementById(item.id);
            if (!el) {
                return 'missing-element-' + item.id;
            }
            let parent = el.closest('div');
            let desc = parent ? parent.querySelector('p') : null;
            if (!desc && parent && parent.parentElement) {
                desc = parent.parentElement.querySelector('p');
            }
            if (!desc || !desc.textContent.includes(item.text)) {
                return 'missing-or-invalid-guidance-' + item.id + ': ' + (desc ? desc.textContent : 'none');
            }
        }
        return 'success';
    })()`,
    ]);
    expect(sliderGuidanceResult).toBe('"success"');

    // 3. Verify Pattern Direction button tooltips (all 12 patterns)
    console.log("Step 3: Testing pattern direction button tooltips...");
    const patternTooltipsResult: string = await runBrowser([
        "eval",
        `(() => {
        const expectedPatterns = [
            { pattern: "up", text: "Ascending order" },
            { pattern: "down", text: "Descending order" },
            { pattern: "upDown", text: "Ascending then descending" },
            { pattern: "downUp", text: "Descending then ascending" },
            { pattern: "upDownRepeat", text: "repeating apex" },
            { pattern: "downUpRepeat", text: "repeating apex" },
            { pattern: "random", text: "random note selection" },
            { pattern: "octaveCycle", text: "across 3 ascending octaves, repeated twice" },
            { pattern: "octaveCycleReverse", text: "across 3 descending octaves, repeated twice" },
            { pattern: "octaveCyclePingPong", text: "alternating ascending and descending" },
            { pattern: "randomWalk", text: "adjacent notes" },
            { pattern: "randomWalkDrunk", text: "occasional unexpected leaps" },
        ];

        const container = document.getElementById('pattern-buttons');
        if (!container) return 'missing-pattern-buttons-container';

        for (const item of expectedPatterns) {
            const radio = container.querySelector(\`input[type="radio"][data-pattern="\${item.pattern}"]\`);
            const btn = container.querySelector(\`.pattern-btn[data-pattern="\${item.pattern}"]\`);
            if (!radio) {
                return 'missing-radio-' + item.pattern;
            }
            if (!btn) {
                return 'missing-btn-' + item.pattern;
            }
            const tooltip = btn.getAttribute('data-tooltip');
            const ariaLabel = radio.getAttribute('aria-label');
            if (!tooltip || !tooltip.toLowerCase().includes(item.text.toLowerCase())) {
                return 'missing-or-invalid-tooltip-' + item.pattern + ': ' + tooltip;
            }
            if (!ariaLabel || !ariaLabel.toLowerCase().includes(item.text.toLowerCase())) {
                return 'missing-or-invalid-aria-label-' + item.pattern + ': ' + ariaLabel;
            }
        }
        return 'success';
    })()`,
    ]);
    expect(patternTooltipsResult).toBe('"success"');

    // 4. Verify Octave Shift and Octave Range subtitles
    console.log("Step 4: Testing Octave Shift and Octave Range micro-labels...");
    const octaveGuidanceResult: string = await runBrowser([
        "eval",
        `(() => {
        const shiftGroup = document.getElementById('octave-shift-buttons');
        const rangeGroup = document.getElementById('octave-range-buttons');
        if (!shiftGroup || !rangeGroup) return 'missing-octave-groups';

        const shiftParent = shiftGroup.closest('div.space-y-2');
        const rangeParent = rangeGroup.closest('div.space-y-2');

        const shiftDesc = shiftParent ? shiftParent.querySelector('p') : null;
        const rangeDesc = rangeParent ? rangeParent.querySelector('p') : null;

        if (!shiftDesc || !shiftDesc.textContent.includes('Transposition offset')) {
            return 'missing-shift-desc: ' + (shiftDesc ? shiftDesc.textContent : 'none');
        }
        if (!rangeDesc || !rangeDesc.textContent.includes('Number of octave duplications')) {
            return 'missing-range-desc: ' + (rangeDesc ? rangeDesc.textContent : 'none');
        }

        return 'success';
    })()`,
    ]);
    expect(octaveGuidanceResult).toBe('"success"');

    // 5. Verify the offline export duration estimate follows loop count and tempo changes
    console.log("Step 5: Testing offline export duration estimate...");
    const exportDurationResult: string = await runBrowser([
        "eval",
        `(() => {
        const notes = document.getElementById('notes');
        const bpm = document.getElementById('bpm');
        const loopCount = document.getElementById('loop-count');
        const duration = document.getElementById('offline-export-duration');
        const octaveRange = document.querySelector('input[name="octave-range"][value="1"]');

        if (!notes || !bpm || !loopCount || !duration || !octaveRange) {
            return 'missing-export-duration-control';
        }

        notes.value = 'C4 E4 G4';
        notes.dispatchEvent(new Event('change', { bubbles: true }));
        octaveRange.checked = true;
        octaveRange.dispatchEvent(new Event('change', { bubbles: true }));
        bpm.value = '60';
        bpm.dispatchEvent(new Event('input', { bubbles: true }));
        loopCount.value = '3';
        loopCount.dispatchEvent(new Event('input', { bubbles: true }));

        return duration.textContent.trim() === '3 loops × ~0.8s/loop = ~2.3 seconds'
            ? 'success'
            : duration.textContent.trim();
    })()`,
    ]);
    expect(exportDurationResult).toBe('"success"');

    console.log("UI Micro-Guidance Integration Suite complete!");
});

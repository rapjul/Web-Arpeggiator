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
const PORT: number = 4181;

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

test("UI Keyboard Arrow Accessibility Navigation Suite", async (): Promise<void> => {
    console.log("Starting Keyboard Accessibility Integration Suite...");
    
    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);
    
    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Click overlay to trigger audio context resume and unlock controls
    console.log("Step 2: Clicking overlay...");
    await runBrowser(["click", "#start-overlay"]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    // 3. Verify Arrow Navigation in Pattern Buttons Group
    console.log("Step 3: Testing keyboard arrow navigation in Pattern Buttons group...");
    const patternA11yResult: string = await runBrowser(["eval", `(async () => {
        const patternGroup = document.getElementById('pattern-buttons');
        const buttons = Array.from(patternGroup.querySelectorAll('button.pattern-btn'));
        
        if (buttons.length < 2) {
            return 'missing-pattern-buttons';
        }
        
        // Focus the first button
        buttons[0].focus();
        if (document.activeElement !== buttons[0]) {
            return 'failed-to-focus-first';
        }
        
        // Simulate ArrowRight keydown
        patternGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        if (document.activeElement !== buttons[1]) {
            return 'failed-arrow-right: ' + document.activeElement.outerHTML;
        }
        
        // Simulate ArrowDown keydown
        patternGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        if (document.activeElement !== buttons[2]) {
            return 'failed-arrow-down: ' + document.activeElement.outerHTML;
        }
        
        // Simulate ArrowLeft keydown
        patternGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        if (document.activeElement !== buttons[1]) {
            return 'failed-arrow-left';
        }
        
        // Simulate wrap-around by going Left from the first button
        buttons[0].focus();
        patternGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        if (document.activeElement !== buttons[buttons.length - 1]) {
            return 'failed-wrap-left';
        }
        
        // Go Right from the last button to test wrap-around in opposite direction
        buttons[buttons.length - 1].focus();
        patternGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        if (document.activeElement !== buttons[0]) {
            return 'failed-wrap-right';
        }
        
        return 'success';
    })()`]);
    expect(patternA11yResult).toBe('"success"');

    // 4. Verify Arrow Navigation in Waveform Buttons Group
    console.log("Step 4: Testing keyboard arrow navigation in Waveform Buttons group...");
    const waveA11yResult: string = await runBrowser(["eval", `(async () => {
        const waveGroup = document.getElementById('waveform-buttons');
        const buttons = Array.from(waveGroup.querySelectorAll('button.waveform-btn'));
        
        if (buttons.length < 2) {
            return 'missing-waveform-buttons';
        }
        
        buttons[0].focus();
        waveGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        if (document.activeElement !== buttons[1]) {
            return 'failed-wave-arrow-right';
        }
        
        return 'success';
    })()`]);
    expect(waveA11yResult).toBe('"success"');

    // 5. Verify Arrow Navigation in Octave Shift Group
    console.log("Step 5: Testing keyboard arrow navigation in Octave Shift group...");
    const shiftA11yResult: string = await runBrowser(["eval", `(async () => {
        const shiftGroup = document.getElementById('octave-shift-buttons');
        const buttons = Array.from(shiftGroup.querySelectorAll('button.octave-btn'));
        
        if (buttons.length < 2) {
            return 'missing-octave-shift-buttons';
        }
        
        buttons[0].focus();
        shiftGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        if (document.activeElement !== buttons[1]) {
            return 'failed-shift-arrow-right';
        }
        
        return 'success';
    })()`]);
    expect(shiftA11yResult).toBe('"success"');

    // 6. Verify Arrow Navigation in Octave Range Group
    console.log("Step 6: Testing keyboard arrow navigation in Octave Range group...");
    const rangeA11yResult: string = await runBrowser(["eval", `(async () => {
        const rangeGroup = document.getElementById('octave-range-buttons');
        const buttons = Array.from(rangeGroup.querySelectorAll('button.octave-btn'));
        
        if (buttons.length < 2) {
            return 'missing-octave-range-buttons';
        }
        
        buttons[0].focus();
        rangeGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        if (document.activeElement !== buttons[1]) {
            return 'failed-range-arrow-right';
        }
        
        return 'success';
    })()`]);
    expect(rangeA11yResult).toBe('"success"');
    
    console.log("Keyboard Accessibility Integration Suite complete!");
}, 30000);

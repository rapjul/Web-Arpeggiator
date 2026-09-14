import { afterAll, beforeAll, expect, test } from "bun:test";
import { ALLOWED_DIRECTIONS } from "@core/url-preset.js";
import {
    cleanupProcesses,
    closeBrowser,
    initializeAudio,
    resetBrowserState,
    runBrowser,
    startTestServer,
    waitForPwaReady,
} from "../test-helpers";

/**
 * The port number for the test server instance.
 * @type {number}
 */
const PORT: number = 4174;

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

test("Arpeggiator Pattern Direction Verification Suite", async (): Promise<void> => {
    console.log("Starting Pattern Direction Integration Suite...");

    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Click overlay to trigger audio context resume
    console.log("Step 2: Initializing audio...");
    await initializeAudio();

    // 3. Exercise every direction the URL parser accepts and the UI exposes.
    for (const name of ALLOWED_DIRECTIONS) {
        console.log(`Testing pattern selection: ${name}`);

        // Click the matching pattern direction button in the DOM
        await runBrowser(["click", `[data-pattern='${name}']`]);

        // Wait briefly for pattern update
        await new Promise((resolve) => setTimeout(resolve, 300));

        // The pattern engine's exact sequence is covered directly by pattern-core unit tests.
        const patternState: string = await runBrowser([
            "eval",
            `(async () => {
            const radio = document.querySelector("input[name='pattern-direction'][value='${name}']");
            if (!radio || !radio.checked) {
                return 'radio-not-checked: ' + '${name}';
            }

            const indicator = document.getElementById('note-step-indicator');
            if (!indicator || indicator.children.length === 0) {
                return 'missing-step-indicator-pips';
            }

            return 'success';
        })()`,
        ]);
        expect(patternState).toBe('"success"');
    }

    console.log("All 12 pattern controls verified successfully!");
}, 45000);

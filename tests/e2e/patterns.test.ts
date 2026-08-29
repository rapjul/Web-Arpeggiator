import { afterAll, beforeAll, expect, test } from "bun:test";
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

    // 3. Define all pattern modes to test
    const patterns = [
        "up",
        "down",
        "upDown",
        "downUp",
        "upDownRepeat",
        "downUpRepeat",
        "random",
        "octaveCycle",
        "octaveCycleReverse",
        "octaveCyclePingPong",
        "randomWalk",
        "randomWalkDrunk",
    ];

    // 4. Sequentially trigger each pattern and verify the Tone.Pattern remains active
    for (const pattern of patterns) {
        console.log(`Testing pattern selection: ${pattern}`);

        // Click the matching pattern direction button in the DOM
        await runBrowser(["click", `[data-pattern='${pattern}']`]);

        // Wait briefly for pattern update
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Verify the pattern is successfully recreated and playing in Tone.js
        const patternState: string = await runBrowser([
            "eval",
            `(async () => {
            if (!window.arpPattern) {
                return 'missing-pattern';
            }
            if (window.arpPattern.state !== 'started') {
                return 'pattern-not-started: ' + window.arpPattern.state;
            }
            return 'success';
        })()`,
        ]);
        expect(patternState).toBe('"success"');
    }

    console.log("All 12 patterns verified successfully!");
}, 45000);

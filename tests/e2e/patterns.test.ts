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

    // 3. Define all pattern modes to test with expected Tone.Pattern direction and value characteristics
    const patterns = [
        { name: "up", expectedTonePattern: "up" },
        { name: "down", expectedTonePattern: "down" },
        { name: "upDown", expectedTonePattern: "upDown" },
        { name: "downUp", expectedTonePattern: "downUp" },
        { name: "upDownRepeat", expectedTonePattern: "up", minValues: 4 },
        { name: "downUpRepeat", expectedTonePattern: "up", minValues: 4 },
        { name: "random", expectedTonePattern: "random" },
        { name: "octaveCycle", expectedTonePattern: "up", minValues: 6 },
        { name: "octaveCycleReverse", expectedTonePattern: "up", minValues: 6 },
        { name: "octaveCyclePingPong", expectedTonePattern: "up", minValues: 7 },
        { name: "randomWalk", expectedTonePattern: "randomWalk" },
        { name: "randomWalkDrunk", expectedTonePattern: "up", minValues: 16 },
    ];

    // 4. Sequentially trigger each pattern and verify the Tone.Pattern and DOM state
    for (const { name, expectedTonePattern, minValues } of patterns) {
        console.log(`Testing pattern selection: ${name}`);

        // Click the matching pattern direction button in the DOM
        await runBrowser(["click", `[data-pattern='${name}']`]);

        // Wait briefly for pattern update
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Verify the pattern is successfully recreated, playing, and matches the selected mode
        const patternState: string = await runBrowser([
            "eval",
            `(async () => {
            if (!window.arpPattern) {
                return 'missing-pattern';
            }
            if (window.arpPattern.state !== 'started') {
                return 'pattern-not-started: ' + window.arpPattern.state;
            }
            if (window.arpPattern.pattern !== '${expectedTonePattern}') {
                return 'unexpected-tone-pattern: ' + window.arpPattern.pattern + ' (expected ${expectedTonePattern})';
            }
            ${
                minValues
                    ? `if (!window.arpPattern.values || window.arpPattern.values.length < ${minValues}) {
                return 'unexpected-values-length: ' + (window.arpPattern.values ? window.arpPattern.values.length : 0);
            }`
                    : ""
            }

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

    console.log("All 12 patterns verified with deep assertions successfully!");
}, 45000);

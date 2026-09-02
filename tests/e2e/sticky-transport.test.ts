import { afterAll, beforeAll, expect, test } from "bun:test";
import {
    cleanupProcesses,
    closeBrowser,
    initializeAudio,
    runBrowser,
    startTestServer,
    waitForPwaReady,
} from "../test-helpers";

/**
 * Port number for sticky transport test server.
 * @type {number}
 */
const PORT: number = 4197;

/**
 * Target application URL.
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

test("Responsive Sticky Transport Bar E2E Suite", async (): Promise<void> => {
    console.log("Starting Responsive Sticky Transport Bar Integration Suite...");

    await waitForPwaReady(APP_URL);
    await initializeAudio();

    // 1. Verify Sticky Transport Bar element exists
    console.log("Step 1: Verifying sticky transport bar container exists...");
    const hasTransportBar: string = await runBrowser([
        "eval",
        `(() => {
            const bar = document.querySelector('.sticky-transport-bar');
            return bar ? 'exists' : 'not-found';
        })()`,
    ]);
    expect(hasTransportBar).toBe('"exists"');

    // 2. Verify Desktop Viewport Behavior
    console.log("Step 2: Checking sticky transport position in desktop viewport (1024x768)...");
    await runBrowser(["set", "viewport", "1024", "768"]);
    const desktopPosition: string = await runBrowser([
        "eval",
        `(() => {
            const bar = document.querySelector('.sticky-transport-bar');
            if (!bar) return 'not-found';
            const style = window.getComputedStyle(bar);
            return style.position;
        })()`,
    ]);
    expect(desktopPosition).toBe('"sticky"');

    // 3. Verify Mobile Viewport Behavior
    console.log("Step 3: Checking fixed thumb bar position in mobile viewport (375x667)...");
    await runBrowser(["set", "viewport", "375", "667"]);
    const mobilePosition: string = await runBrowser([
        "eval",
        `(() => {
            const bar = document.querySelector('.sticky-transport-bar');
            if (!bar) return 'not-found';
            const style = window.getComputedStyle(bar);
            return style.position;
        })()`,
    ]);
    expect(mobilePosition).toBe('"fixed"');

    console.log("Responsive Sticky Transport Bar E2E Suite completed successfully.");
}, 30000);

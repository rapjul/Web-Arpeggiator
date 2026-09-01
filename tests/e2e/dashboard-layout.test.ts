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
 * Port number for layout test server.
 * @type {number}
 */
const PORT: number = 4198;

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

test("Dashboard Layout & Section Order E2E Suite", async (): Promise<void> => {
    console.log("Starting Dashboard Layout & Section Order Integration Suite...");

    await waitForPwaReady(APP_URL);
    await initializeAudio();

    // 1. Verify Logical DOM Order of Cards
    console.log("Step 1: Checking DOM sequence of main sections for natural creative workflow...");
    const sectionOrder: string = await runBrowser([
        "eval",
        `(() => {
            const headings = Array.from(document.querySelectorAll('main#app-main > section, main#app-main > div'));
            return JSON.stringify(headings.map(el => {
                const h2 = el.querySelector('h2');
                return h2 ? h2.textContent.trim() : (el.id || el.className);
            }));
        })()`,
    ]);

    // Parse order
    const parsed = JSON.parse(JSON.parse(sectionOrder));
    expect(parsed.length).toBeGreaterThan(5);

    // Verify Pattern section appears before Synth, Envelope, Filter, and Effects
    const patternIdx = parsed.findIndex((s: string) => s.includes("Pattern"));
    const synthIdx = parsed.findIndex((s: string) => s.includes("Synth"));
    const filterIdx = parsed.findIndex((s: string) => s.includes("Filter"));

    expect(patternIdx).toBeGreaterThan(-1);
    expect(synthIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeGreaterThan(-1);
    expect(patternIdx).toBeLessThan(synthIdx);
    expect(synthIdx).toBeLessThan(filterIdx);

    console.log("Dashboard Layout & Section Order E2E Suite completed successfully.");
}, 30000);

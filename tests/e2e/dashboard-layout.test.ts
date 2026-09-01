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

    // Verify Complete Workflow Sequence
    const soundStartersIdx = parsed.findIndex(
        (s: string) => s.includes("Sound Starters") || s.includes("sound-starters"),
    );
    const patternIdx = parsed.findIndex((s: string) => s.includes("Pattern"));
    const scaleIdx = parsed.findIndex((s: string) => s.includes("Scale Quantization"));
    const octaveIdx = parsed.findIndex((s: string) => s.includes("Octave"));
    const keyboardIdx = parsed.findIndex((s: string) => s.includes("Keyboard"));
    const synthIdx = parsed.findIndex((s: string) => s.includes("Synth"));
    const envIdx = parsed.findIndex((s: string) => s.includes("Envelope"));
    const filterIdx = parsed.findIndex((s: string) => s.includes("Filter"));
    const effectsIdx = parsed.findIndex((s: string) => s.includes("Effects"));

    expect(soundStartersIdx).toBeGreaterThan(-1);
    expect(patternIdx).toBeGreaterThan(-1);
    expect(scaleIdx).toBeGreaterThan(-1);
    expect(octaveIdx).toBeGreaterThan(-1);
    expect(keyboardIdx).toBeGreaterThan(-1);
    expect(synthIdx).toBeGreaterThan(-1);
    expect(envIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeGreaterThan(-1);
    expect(effectsIdx).toBeGreaterThan(-1);

    expect(soundStartersIdx).toBeLessThan(patternIdx);
    expect(patternIdx).toBeLessThan(scaleIdx);
    expect(scaleIdx).toBeLessThan(octaveIdx);
    expect(octaveIdx).toBeLessThan(keyboardIdx);
    expect(keyboardIdx).toBeLessThan(synthIdx);
    expect(synthIdx).toBeLessThan(envIdx);
    expect(envIdx).toBeLessThan(filterIdx);
    expect(filterIdx).toBeLessThan(effectsIdx);

    console.log("Dashboard Layout & Section Order E2E Suite completed successfully.");
}, 30000);

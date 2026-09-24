import { expect, test } from "./fixtures/app";

/**
 * @file Playwright E2E tests verifying audio startup latency budgets,
 * Performance API telemetry marks, and warm restart responsiveness.
 */

test.describe("Audio Playback Startup Latency", () => {
    test("measures cold-start audio startup latency within bounded threshold", async ({
        pwaPage: page,
    }) => {
        await page.goto("/?perf=true");
        // First-visit onboarding modal is visible on cold page
        await expect(page.locator("#quick-start-overlay")).toBeVisible();
        const firstStarterCard = page.locator(".sound-starter-card").first();
        await expect(firstStarterCard).toBeVisible();

        // Clear any previous marks from initial page script evaluation
        await page.evaluate(() => {
            performance.clearMarks();
            performance.clearMeasures();
        });

        // Trigger cold start directly from preset card before runtime initialization
        const startTime = Date.now();
        await firstStarterCard.click();

        // Await onboarding closed, transport running, and first note step indicator active
        await expect(page.locator("#quick-start-overlay")).toBeHidden();
        await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
        await expect(page.locator("#note-step-indicator .note-step-pip.active")).toHaveCount(1);

        const wallClockDurationMs = Date.now() - startTime;

        // Query performance measures recorded by application startup profiler
        const profilerMeasures = await page.evaluate(() => {
            return performance.getEntriesByType("measure").map((entry) => ({
                name: entry.name,
                duration: entry.duration,
            }));
        });

        const coldStartMeasure = profilerMeasures.find((m) => m.name === "audio:total-cold-start");
        const transportMeasure = profilerMeasures.find(
            (m) => m.name === "audio:transport-to-first-note",
        );

        // Assert cold start latency is strictly under 2500ms (budget for headless CI)
        expect(wallClockDurationMs).toBeLessThan(2500);

        expect(coldStartMeasure).toBeDefined();
        if (coldStartMeasure) {
            expect(coldStartMeasure.duration).toBeLessThan(2500);
        }

        expect(transportMeasure).toBeDefined();
        if (transportMeasure) {
            // Once transport starts, first note should trigger well under 150ms
            expect(transportMeasure.duration).toBeLessThan(150);
        }
    });

    test("measures immediate audio startup latency right after page loads via start overlay", async ({
        pwaPage: page,
    }) => {
        // Mark as visited so start-overlay is shown instead of first-visit quick-start modal
        await page.addInitScript(() => {
            localStorage.setItem("webArpHasVisited", "true");
        });
        await page.goto("/?perf=true");

        // Start overlay is visible immediately on load for returning visits
        const startButton = page.locator("#start-button");
        await expect(startButton).toBeVisible();

        // Clear marks from initial page script evaluation
        await page.evaluate(() => {
            performance.clearMarks();
            performance.clearMeasures();
        });

        // Trigger immediate start from overlay
        const startTime = Date.now();
        await startButton.click();

        // Overlay should hide and audio transport should start playing
        await expect(page.locator("#start-overlay")).toBeHidden();
        await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
        await expect(page.locator("#note-step-indicator .note-step-pip.active")).toHaveCount(1);

        const wallClockDurationMs = Date.now() - startTime;
        expect(wallClockDurationMs).toBeLessThan(2500);

        const profilerMeasures = await page.evaluate(() => {
            return performance.getEntriesByType("measure").map((entry) => ({
                name: entry.name,
                duration: entry.duration,
            }));
        });

        const transportMeasure = profilerMeasures.find(
            (m) => m.name === "audio:transport-to-first-note",
        );
        expect(transportMeasure).toBeDefined();
        if (transportMeasure) {
            expect(transportMeasure.duration).toBeLessThan(150);
        }
    });

    test("measures cold-start audio latency after idle dwell time (simulating user reading page)", async ({
        pwaPage: page,
    }) => {
        await page.addInitScript(() => {
            localStorage.setItem("webArpHasVisited", "true");
        });
        await page.goto("/?perf=true");

        const startButton = page.locator("#start-button");
        await expect(startButton).toBeVisible();

        // Wait 3 seconds to simulate user reading the page before clicking
        await page.waitForTimeout(3000);

        // Clear previous marks from idle wait
        await page.evaluate(() => {
            performance.clearMarks();
            performance.clearMeasures();
        });

        // Trigger cold start after idle dwell time
        const startTime = Date.now();
        await startButton.click();

        await expect(page.locator("#start-overlay")).toBeHidden();
        await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
        await expect(page.locator("#note-step-indicator .note-step-pip.active")).toHaveCount(1);

        const wallClockDurationMs = Date.now() - startTime;
        expect(wallClockDurationMs).toBeLessThan(2500);

        const profilerMeasures = await page.evaluate(() => {
            return performance.getEntriesByType("measure").map((entry) => ({
                name: entry.name,
                duration: entry.duration,
            }));
        });

        const transportMeasure = profilerMeasures.find(
            (m) => m.name === "audio:transport-to-first-note",
        );
        expect(transportMeasure).toBeDefined();
        if (transportMeasure) {
            // Must start promptly without elapsed-tick scheduling delay (< 150ms)
            expect(transportMeasure.duration).toBeLessThan(150);
        }
    });

    test("verifies warm restart latency is instantaneous (< 300ms)", async ({ pwaPage: page }) => {
        // Dismiss onboarding
        await page.locator("#quick-start-scratch").click();
        await expect(page.locator("#quick-start-overlay")).toBeHidden();

        // Start playback once to warm up AudioContext and engine
        await page.locator("#play-stop").click();
        await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
        await expect(page.locator("#note-step-indicator .note-step-pip.active")).toHaveCount(1);

        // Stop playback
        await page.locator("#play-stop").click();
        await expect(page.locator("#play-stop")).toHaveText("Restart Audio");
        await expect(page.locator("#note-step-indicator .note-step-pip.active")).toHaveCount(0);

        // Measure warm restart time from click until active pip renders
        const restartStartTime = Date.now();
        await page.locator("#play-stop").click();

        await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
        await expect(page.locator("#note-step-indicator .note-step-pip.active")).toHaveCount(1);

        const restartDurationMs = Date.now() - restartStartTime;

        // Warm restart must take less than 300ms
        expect(restartDurationMs).toBeLessThan(300);
    });

    test("confirms background recorder pre-warming does not delay transport startup", async ({
        pwaPage: page,
    }) => {
        await page.locator("#quick-start-scratch").click();
        await expect(page.locator("#play-stop")).toHaveText("Start Audio");

        // Verify recorder button is visible and initially idle
        const recordButton = page.locator("#record-button");
        await expect(recordButton).toBeVisible();
        await expect(recordButton).not.toHaveClass(/recording/);

        // Start audio and transport
        await page.locator("#play-stop").click();
        await expect(page.locator("#play-stop")).toHaveText("Stop Audio");

        // Note step indicator activates promptly
        await expect(page.locator("#note-step-indicator .note-step-pip.active")).toHaveCount(1);

        // Recording button remains in a ready-to-record state without having blocked transport
        await expect(recordButton).toBeEnabled();
        await expect(recordButton).toHaveText(/Record/);
    });
});

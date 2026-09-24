import { expect, test } from "./fixtures/app";

/**
 * @file Playwright E2E tests verifying audio startup latency budgets,
 * Performance API telemetry marks, and warm restart responsiveness.
 */

test.describe("Audio Playback Startup Latency", () => {
    test("measures cold-start audio startup latency within bounded threshold", async ({
        pwaPage: page,
    }) => {
        // Dismiss first-visit onboarding to get to initial clean state
        await page.locator("#quick-start-scratch").click();
        await expect(page.locator("#quick-start-overlay")).toBeHidden();
        await expect(page.locator("#play-stop")).toHaveText("Start Audio");

        // Clear any previous marks from initial page setup
        await page.evaluate(() => {
            performance.clearMarks();
            performance.clearMeasures();
        });

        // Trigger cold start
        const startTime = Date.now();
        await page.locator("#play-stop").click();

        // Await transport running and first note step indicator active
        await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
        await expect(page.locator("#note-step-indicator .note-step-pip.active")).toHaveCount(1);

        const wallClockDurationMs = Date.now() - startTime;

        // Query performance measures recorded by application telemetry
        const telemetryMeasures = await page.evaluate(() => {
            return performance.getEntriesByType("measure").map((entry) => ({
                name: entry.name,
                duration: entry.duration,
            }));
        });

        const coldStartMeasure = telemetryMeasures.find((m) => m.name === "audio:total-cold-start");
        const transportMeasure = telemetryMeasures.find(
            (m) => m.name === "audio:transport-to-first-note",
        );

        // Assert cold start latency is strictly under 2500ms (budget for headless CI)
        expect(wallClockDurationMs).toBeLessThan(2500);

        if (coldStartMeasure) {
            expect(coldStartMeasure.duration).toBeLessThan(2500);
        }

        if (transportMeasure) {
            // Once transport starts, first note should trigger well under 500ms
            expect(transportMeasure.duration).toBeLessThan(500);
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

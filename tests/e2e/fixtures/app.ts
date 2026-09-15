import { expect, test as base, type Page } from "@playwright/test";

const DATABASE_NAME = "web-arpeggiator-presets";
const STORES_TO_RESET = ["presetSnapshots", "lastSession"];

type AppFixtures = {
    pwaPage: Page;
};

/**
 * Opens the production-preview PWA and waits until its service worker controls
 * the page. A reload is required before a first-time registration controls the
 * current document.
 */
export async function openPwa(page: Page): Promise<void> {
    await page.goto("/index.html?pwa=true", { waitUntil: "domcontentloaded" });
    await expect
        .poll(() =>
            page.evaluate(async () => {
                const registration = await navigator.serviceWorker?.getRegistration("./");
                return registration !== undefined;
            }),
        )
        .toBe(true);
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker?.controller !== null))
        .toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#notes")).toBeVisible();
}

/**
 * Clears persisted UI state through browser platform APIs and reloads the app
 * so each scenario starts from the documented default note set.
 */
export async function resetAppState(page: Page): Promise<void> {
    await page.evaluate(
        async ({ databaseName, storesToReset }) => {
            localStorage.clear();

            const database = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(databaseName);
                request.addEventListener("success", () => resolve(request.result));
                request.addEventListener("error", () => reject(request.error));
            });

            try {
                const availableStores = storesToReset.filter((storeName) =>
                    database.objectStoreNames.contains(storeName),
                );
                if (availableStores.length === 0) return;

                const transaction = database.transaction(availableStores, "readwrite");
                for (const storeName of availableStores) transaction.objectStore(storeName).clear();
                await new Promise<void>((resolve, reject) => {
                    transaction.addEventListener("complete", () => resolve());
                    transaction.addEventListener("error", () => reject(transaction.error));
                    transaction.addEventListener("abort", () => reject(transaction.error));
                });
            } finally {
                database.close();
            }
        },
        { databaseName: DATABASE_NAME, storesToReset: STORES_TO_RESET },
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#notes")).toHaveValue("C4 E4 G4");
}

/**
 * Dismisses either public onboarding path and waits for the app controls to be
 * enabled by its user-gesture activation flow.
 */
export async function dismissOnboarding(page: Page): Promise<void> {
    const quickStartOverlay = page.locator("#quick-start-overlay");
    if (await quickStartOverlay.isVisible()) {
        await page.locator("#quick-start-scratch").click();
    } else {
        await expect(page.locator("#start-overlay")).toBeVisible();
        await page.locator("#start-overlay").click();
    }

    const playStop = page.locator("#play-stop");
    await expect(playStop).toBeEnabled();
}

/**
 * Uses the onboarding UI to satisfy the browser's user-gesture audio policy,
 * then starts playback at a quiet test volume.
 */
export async function startAudio(page: Page): Promise<void> {
    await dismissOnboarding(page);

    const playStop = page.locator("#play-stop");
    await page.locator("#post-gain").fill("-12");
    await playStop.click();
    await expect(playStop).toHaveText("Stop Audio");
}

/**
 * Native Playwright fixture for new scenarios. Legacy suites retain their
 * temporary compatibility helper until they are migrated in later slices.
 */
export const test = base.extend<AppFixtures>({
    pwaPage: async ({ page }, use) => {
        await openPwa(page);
        await resetAppState(page);
        await use(page);
    },
});

export { expect, type Page };

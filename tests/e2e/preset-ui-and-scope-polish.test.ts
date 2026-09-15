import { dismissOnboarding, expect, test, type Page } from "./fixtures/app";

const DATABASE_NAME = "web-arpeggiator-presets";

async function makeBrowserStorageUnavailable(page: Page): Promise<void> {
    await page.evaluate(async (databaseName) => {
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(databaseName);
            request.addEventListener("success", () => resolve());
            request.addEventListener("error", () => reject(request.error));
            request.addEventListener("blocked", () =>
                reject(new Error("Browser storage deletion was blocked.")),
            );
        });

        const nativeIndexedDb = window.indexedDB;
        document.documentElement.dataset.browserStorageAvailable = "false";
        Object.defineProperty(window, "indexedDB", {
            configurable: true,
            get: () =>
                document.documentElement.dataset.browserStorageAvailable === "true"
                    ? nativeIndexedDb
                    : undefined,
        });
    }, DATABASE_NAME);
}

async function restoreBrowserStorage(page: Page): Promise<void> {
    await page.evaluate(() => {
        document.documentElement.dataset.browserStorageAvailable = "true";
    });
}

test("saves a browser preset and exposes the complete preset control hierarchy", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);

    const controls = [
        "#preset-name-input",
        "#save-preset-to-browser-button",
        "#load-saved-preset-button",
        "#delete-saved-preset-button",
        "#clear-saved-preset-button",
        "#save-preset-button",
        "#load-preset-button",
        "#share-preset-button",
        "#saved-preset-select",
    ];
    for (const selector of controls) await expect(page.locator(selector)).toBeVisible();

    await page.locator("#preset-name-input").fill("Cyberpunk Test Preset");
    await page.locator("#save-preset-to-browser-button").click();
    await expect(page.locator("#saved-preset-select")).toContainText("Cyberpunk Test Preset");
});

test("shows browser-storage recovery guidance and hides it after a successful retry", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);
    await makeBrowserStorageUnavailable(page);

    const presetName = page.locator("#preset-name-input");
    const saveButton = page.locator("#save-preset-to-browser-button");
    const recovery = page.locator("#browser-storage-recovery");
    await presetName.fill("Unavailable browser preset");
    await saveButton.click();
    await expect(recovery).toBeVisible();
    await expect(recovery).toHaveAttribute("open", "");

    await restoreBrowserStorage(page);
    await presetName.fill("Recovered browser preset");
    await saveButton.click();
    await expect(page.locator("#saved-preset-select")).toContainText("Recovered browser preset");
    await expect(recovery).toBeHidden();
    await expect(recovery).not.toHaveAttribute("open");
});

test("toggles and pauses the visualizer through its public controls", async ({ pwaPage: page }) => {
    await dismissOnboarding(page);

    const toggle = page.locator("#toggle-visualizer");
    const pause = page.locator("#pause-visualizer");
    await expect(page.locator("#clear-saved-preset-button")).toHaveClass(/bg-red-600/);
    await expect(page.locator("#clear-saved-preset-button")).toHaveClass(/text-white/);
    const details = toggle.locator("xpath=ancestor::details");
    if ((await details.getAttribute("open")) === null) await details.locator("summary").click();

    await toggle.click();
    await expect(toggle).toHaveText("Disable Visualizer");
    await pause.click();
    await expect(pause).toHaveText("Resume");
    await pause.click();
    await expect(pause).toHaveText("Pause");
    await toggle.click();
    await expect(toggle).toHaveText("Enable Visualizer");
});

test("loads the selected factory preset", async ({ pwaPage: page }) => {
    await dismissOnboarding(page);

    await page.locator("#saved-preset-select").selectOption("factory-synthwave");
    await page.locator("#load-saved-preset-button").click();
    await expect(page.locator("#bpm")).toHaveValue("128");
    await expect(page.locator("#synth-type")).toHaveValue("synth");
});

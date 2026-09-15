import { dismissOnboarding, expect, test } from "./fixtures/app";

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

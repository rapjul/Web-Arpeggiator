import { dismissOnboarding, expect, readPersistedSession, test } from "./fixtures/app";

async function setBpm(page: import("@playwright/test").Page, bpm: string): Promise<void> {
    await page.locator("#bpm").fill(bpm);
    await expect(page.locator("#bpm")).toHaveValue(bpm);
}

test("undoes, redoes, and resets settings through public history controls", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);

    await page.locator("#preset-name-input").focus();
    await page.keyboard.press("Control+z");
    await expect(page.locator("#preset-name-input")).toBeFocused();

    await setBpm(page, "150");
    await expect(page.locator("#undo-button")).toBeEnabled();
    await page.locator("#undo-button").click();
    await expect(page.locator("#bpm")).toHaveValue("120");
    await expect(page.locator("#redo-button")).toBeEnabled();

    await page.getByRole("heading", { name: "Web Arpeggiator" }).click();
    await page.keyboard.press("Control+y");
    await expect(page.locator("#bpm")).toHaveValue("150");
    await page.keyboard.press("Control+z");
    await expect(page.locator("#bpm")).toHaveValue("120");

    await setBpm(page, "160");
    await page.locator("#bpm-value").dblclick();
    await expect(page.locator("#bpm")).toHaveValue("120");

    await setBpm(page, "165");
    await page.locator("#reset-defaults-desktop-button").click();
    await expect(page.locator("#reset-defaults-overlay")).toHaveAttribute("aria-hidden", "false");
    await page.locator("#reset-defaults-cancel").click();

    await setBpm(page, "170");
    await page.locator("#reset-defaults-desktop-button").click();
    await expect(page.locator("#reset-defaults-overlay")).toHaveAttribute("aria-hidden", "false");
    await page.locator("#reset-defaults-confirm").click();
    await expect(page.locator("#bpm")).toHaveValue("120");
});

test("presents desktop buttons and accessible mobile history menu actions", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator("#reset-defaults-desktop-button")).toBeVisible();
    await expect(page.locator("#history-menu-button")).toBeHidden();
    await expect(page.locator("#reset-defaults-description")).toContainText(
        "This restores the built-in arpeggiator defaults.",
    );

    await page.setViewportSize({ width: 375, height: 667 });
    const historyButton = page.locator("#history-menu-button");
    await expect(historyButton).toBeVisible();
    await expect(page.locator("#reset-defaults-desktop-button")).toBeHidden();
    await setBpm(page, "150");
    await historyButton.click();
    await expect(page.locator("#history-menu")).toBeVisible();
    await expect(page.locator("#history-menu")).toContainText("Reset All Settings");
    await expect(page.locator("#history-menu")).toContainText("Undo");
    await expect(page.locator("#history-menu")).toContainText("Redo");
    await page.locator("#history-menu-undo").click();
    await expect(historyButton).toBeFocused();
    await expect(page.locator("#history-menu")).toBeHidden();
});

test("restores persisted history settings after reload", async ({ pwaPage: page }) => {
    await dismissOnboarding(page);
    await setBpm(page, "155");

    await expect.poll(() => readPersistedSession(page)).toMatchObject({ bpm: 155 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#bpm")).toHaveValue("155");
    await expect(page.locator("#undo-button")).toBeEnabled();
});

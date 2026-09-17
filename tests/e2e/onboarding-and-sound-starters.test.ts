import { expect, resetAppState, test } from "./fixtures/app";

test("starts a factory sound starter from the first-visit quick start", async ({
    pwaPage: page,
}) => {
    await expect(page.locator("#quick-start-overlay")).toBeVisible();
    await expect(page.locator("#start-overlay")).toBeHidden();
    await page.locator("#quick-start-simple").click();
    await expect(page.locator("#quick-start-presets-grid .sound-starter-card")).toHaveCount(6);
    await expect(page.locator("#app-main")).toHaveAttribute("data-interface-mode", "simple");
    await expect(page.locator("#interface-mode")).toHaveValue("simple");
    await expect(page.locator("#octave-title")).toBeHidden();
    await expect(page.locator("#scale-quantize-toggle")).toBeChecked();
    await expect(page.locator("#scale-quantize-toggle-status")).toHaveText(/Enabled/);

    await page
        .locator('#quick-start-presets-grid button[data-preset-id="factory-synthwave"]')
        .click();
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#notes")).toHaveValue("C4 E4 G4 B4");
    await expect(page.locator("#bpm")).toHaveValue("128");
    await expect(
        page.locator('#sound-starters-grid [data-preset-id="factory-synthwave"]'),
    ).toHaveClass(/active/);
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem("webArpHasVisited")))
        .toBe("true");
});

test("loads sound starters, clears their active state on an edit, and remembers collapse", async ({
    pwaPage: page,
}) => {
    await page.locator("#quick-start-full").click();
    await page
        .locator('#quick-start-presets-grid button[data-preset-id="factory-ambient"]')
        .click();
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
    await expect(page.locator("#notes")).toHaveValue("C4 G4 C5 D5");
    await expect(page.locator("#bpm")).toHaveValue("85");
    await expect(
        page.locator('#sound-starters-grid [data-preset-id="factory-ambient"]'),
    ).toHaveClass(/active/);

    await page.locator("#bpm").fill("99");
    await expect(page.locator("#sound-starters-grid .sound-starter-card.active")).toHaveCount(0);

    const details = page.locator("#sound-starters-details");
    if ((await details.getAttribute("open")) !== null) await details.locator("summary").click();
    await expect(details).not.toHaveAttribute("open", "");
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem("soundStartersOpen")))
        .toBe("false");
});

test("can pause and resume the optional creation walkthrough", async ({ pwaPage: page }) => {
    await page.locator("#quick-start-full").click();
    await page.locator("#quick-start-scratch").click();
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await page.locator("#guided-workflow-start").click();
    await expect(page.locator("#guided-workflow-active")).toBeVisible();
    await expect(page.locator("#guided-workflow-status")).toContainText("Step 1 of 5");

    await page.locator("#guided-workflow-skip").click();
    await expect(page.locator("#guided-workflow-start")).toHaveText("Resume walkthrough");
    await page.locator("#guided-workflow-start").click();
    await expect(page.locator("#guided-workflow-status")).toContainText("Step 1 of 5");
});

test("dismisses quick start from scratch or with Escape", async ({ pwaPage: page }) => {
    await page.locator("#quick-start-full").click();
    await page.locator("#quick-start-scratch").click();
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#play-stop")).toHaveText("Start Audio");
    await expect(page.locator("#notes")).toHaveValue("C4 E4 G4");
    await expect(page.locator("#sound-starters-details")).not.toHaveAttribute("open", "");

    await resetAppState(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#play-stop")).toBeEnabled();
});

test("shows the simple overlay for returning visitors and URL presets", async ({
    pwaPage: page,
}) => {
    await page.evaluate(() => localStorage.setItem("webArpHasVisited", "true"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#start-overlay")).toBeVisible();

    await resetAppState(page);
    await page.goto("/index.html?pwa=true&bpm=170&synth=fmSynth&notes=D4%20F4%20A4", {
        waitUntil: "domcontentloaded",
    });
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#start-overlay")).toBeVisible();
    await expect(page.locator("#bpm")).toHaveValue("170");
    await expect(page.locator("#notes")).toHaveValue("D4 F4 A4");
});

test("synchronizes a selected factory preset with its sound starter card", async ({
    pwaPage: page,
}) => {
    await page.locator("#quick-start-full").click();
    await page.locator("#quick-start-scratch").click();
    await expect(page.locator("#play-stop")).toBeEnabled();

    await page.locator("#saved-preset-select").selectOption("factory-cyberpunk");
    await page.locator("#load-saved-preset-button").click();
    await expect(
        page.locator('#sound-starters-grid [data-preset-id="factory-cyberpunk"]'),
    ).toHaveClass(/active/);
});

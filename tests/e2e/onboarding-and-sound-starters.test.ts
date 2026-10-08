import { captureDownload, expect, parsePcmWav, resetAppState, test } from "./fixtures/app";

test("starts a factory sound starter from the first-visit quick start", async ({
    pwaPage: page,
}) => {
    await expect(page.locator("#quick-start-overlay")).toBeVisible();
    await page.locator("#quick-start-simple").click();
    await expect(page.locator("#quick-start-mode-choice")).toBeHidden();
    await expect(page.locator("#quick-start-mode-content")).toBeVisible();
    await expect(page.locator("#quick-start-presets-grid .sound-starter-card")).toHaveCount(11);
    await expect(page.locator("#app-main")).toHaveAttribute("data-interface-mode", "simple");
    await expect(page.locator("#app-main")).not.toHaveAttribute("hidden", "");
    await expect(page.locator("#interface-mode-simple-btn")).toHaveAttribute(
        "aria-checked",
        "true",
    );
    await expect(page.locator("#interface-mode-full-btn")).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("#octave-title")).toBeHidden();
    await expect(page.locator("#utilities-title")).toBeHidden();

    await expect(page.locator("#scale-quantize-toggle")).toBeChecked();
    await expect(page.locator("#scale-quantize-toggle-status")).toHaveText(/Enabled/);

    await page
        .locator('#quick-start-presets-grid button[data-preset-id="factory-synthwave"]')
        .click();
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#notes")).toHaveValue("A2 E3 A3 C4 E4 G4 A4 B4");
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
    await expect(page.locator("#notes")).toHaveValue("C3 G3 D4 E4 G4 B4 D5");
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

test("dismisses quick start from scratch or with Escape", async ({ pwaPage: page }) => {
    await expect(page.locator("#quick-start-simple")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#quick-start-full")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#quick-start-simple")).toBeFocused();

    await page.locator("#quick-start-full").click();
    await page.locator("#quick-start-scratch").click();
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#play-stop")).toHaveText("Start Audio");
    await expect(page.locator("#notes")).toHaveValue("C4 E4 G4");
    await expect(page.locator("#sound-starters-details")).not.toHaveAttribute("open", "");

    await resetAppState(page);
    await page.evaluate(() => localStorage.setItem("webArpInterfaceMode", "simple"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#app-main")).toHaveAttribute("data-interface-mode", "simple");
    await page.keyboard.press("Escape");
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#play-stop")).toBeEnabled();
    await expect(page.locator("#interface-mode-full-btn")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#interface-mode-simple-btn")).toHaveAttribute(
        "aria-checked",
        "false",
    );
    await expect
        .poll(() => page.evaluate(() => localStorage.getItem("webArpInterfaceMode")))
        .toBe("full");
});

test("deactivates hidden interactive tools when switching to Simple controls", async ({
    pwaPage: page,
}) => {
    await page.locator("#quick-start-full").click();
    await page.locator("#quick-start-scratch").click();
    await expect(page.locator("#play-stop")).toBeEnabled();

    const keyboardToggle = page.locator("#keyboard-toggle");
    const visualizerToggle = page.locator("#toggle-visualizer");
    const recordButton = page.locator("#record-button");
    await page.locator("#keyboard-details > summary").click();
    await page.locator("section[aria-labelledby='utilities-title'] summary").click();
    await keyboardToggle.check();
    await visualizerToggle.click();
    await recordButton.click();
    await expect(recordButton).toHaveClass(/recording/);

    await page.locator("#interface-mode-simple-btn").click();

    await expect(keyboardToggle).not.toBeChecked();
    await expect(visualizerToggle).toHaveText("Enable Visualizer");
    await expect(recordButton).not.toHaveClass(/recording/);
    await expect(page.locator("#utilities-title")).toBeHidden();
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

test("starts audio playback immediately when clicking the returning visitor start overlay", async ({
    pwaPage: page,
}) => {
    await page.evaluate(() => localStorage.setItem("webArpHasVisited", "true"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#start-overlay")).toBeVisible();
    await expect(page.locator("#start-button")).toHaveText("Start and Enable Audio");

    await page.locator("#start-button").click();
    await expect(page.locator("#start-overlay")).toBeHidden();
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
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

test("generates and downloads an offline audio render in Simple mode", async ({
    pwaPage: page,
}) => {
    await page.locator("#quick-start-full").click();
    await page.locator("#quick-start-scratch").click();
    await expect(page.locator("#play-stop")).toBeEnabled();

    await page.locator("#notes").fill("C4");
    await page.locator("#notes").dispatchEvent("change");
    await page.locator("input[name='octave-range'][value='1']").locator("xpath=..").click();
    await expect(page.locator("#bpm")).toHaveValue("120");

    await page.locator("#interface-mode-full-btn").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#interface-mode-simple-btn")).toHaveAttribute(
        "aria-checked",
        "true",
    );
    await expect(page.locator("#octave-title")).toBeHidden();
    await expect(page.locator("#notes")).toHaveValue("C4");

    const offlineExportSection = page.locator("section[aria-labelledby='offline-export-title']");
    await expect(offlineExportSection).toBeVisible();
    await page.locator("#offline-export-mode-seamless").check();
    await page.locator("#loop-count").fill("1");
    await page.locator("#offline-export-mp3").uncheck();

    const download = await captureDownload(page, () =>
        page.locator("#offline-export-button").click(),
    );
    const wav = parsePcmWav(download.bytes);

    expect(download.filename).toMatch(/\.wav$/);
    expect(wav.durationSeconds).toBeGreaterThan(0);
    expect(Math.abs(wav.durationSeconds - 0.125)).toBeLessThanOrEqual(1 / wav.sampleRate);
    expect(wav.firstAudibleFrame).toBeLessThan(wav.durationSeconds * wav.sampleRate);
    expect(wav.peak).toBeGreaterThan(0.002);
    expect(wav.rms).toBeGreaterThan(0.0001);
    await expect(page.locator("#offline-export-status")).toContainText("complete");
    await expect(page.locator("#offline-export-button")).toBeEnabled();

    await expect
        .poll(() => page.evaluate(() => localStorage.getItem("webArpInterfaceMode")))
        .toBe("simple");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#interface-mode-simple-btn")).toHaveAttribute(
        "aria-checked",
        "true",
    );
    await expect(page.locator("#octave-title")).toBeHidden();
});

test("starts the Lo-Fi Chillhop preset and applies its tempo and notes", async ({
    pwaPage: page,
}) => {
    await page.locator("#quick-start-full").click();
    await page
        .locator('#quick-start-presets-grid button[data-preset-id="factory-lofi-beats"]')
        .click();
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#notes")).toHaveValue("C3 G3 A#3 D#4 G4 A#4 D5");
    await expect(page.locator("#bpm")).toHaveValue("76");
    await expect(
        page.locator('#sound-starters-grid [data-preset-id="factory-lofi-beats"]'),
    ).toHaveClass(/active/);
});

test("re-opens quick start modal on demand via header Guide button and dismisses without altering state", async ({
    pwaPage: page,
}) => {
    await page.locator("#quick-start-full").click();
    await page.locator("#quick-start-scratch").click();
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#play-stop")).toBeEnabled();

    await expect(page.locator("#notes")).toHaveValue("C4 E4 G4");
    await expect(page.locator("#bpm")).toHaveValue("120");

    await page.locator("#quick-start-help-btn").click();
    await expect(page.locator("#quick-start-overlay")).toBeVisible();
    await expect(page.locator("#quick-start-mode-choice")).toBeHidden();
    await expect(page.locator("#quick-start-mode-content")).toBeVisible();
    await expect(page.locator("#quick-start-workflow-guide")).toBeVisible();
    await expect(page.locator("#quick-start-presets-grid .sound-starter-card")).toHaveCount(11);

    await page.locator("#quick-start-close").click();
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#notes")).toHaveValue("C4 E4 G4");
    await expect(page.locator("#bpm")).toHaveValue("120");
    await expect(page.locator("#quick-start-help-btn")).toBeFocused();

    await page.locator("#quick-start-help-btn").click();
    await expect(page.locator("#quick-start-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#quick-start-overlay")).toBeHidden();
    await expect(page.locator("#quick-start-help-btn")).toBeFocused();
});

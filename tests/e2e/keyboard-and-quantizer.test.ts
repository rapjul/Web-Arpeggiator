import {
    downloadCurrentPatternMidi,
    expect,
    extractMidiNoteOns,
    startAudio,
    test,
} from "./fixtures/app";

test("plays, labels, and adds notes through the virtual keyboard", async ({ pwaPage: page }) => {
    await startAudio(page);

    const c4Key = page.locator(".piano-key[data-note='C4']");
    const keyboardToggle = page.locator("#keyboard-toggle");
    await page.locator("#keyboard-details > summary").click();
    await page.locator("label").filter({ has: keyboardToggle }).click();
    await expect(keyboardToggle).toBeChecked();
    await page.getByRole("heading", { name: "Web Arpeggiator" }).click();
    await page.keyboard.down("z");
    await expect(c4Key).toHaveClass(/active/);
    await page.keyboard.up("z");
    await expect(c4Key).not.toHaveClass(/active/);
    await expect(c4Key.locator(".key-pitch-label")).toHaveText("C4");

    await page.locator("#notes").fill("C4 E4");
    await page.locator("#notes").dispatchEvent("change");
    await page.locator("#keyboard-mode-add").click();
    await page.locator(".piano-key[data-note='G4']").click();
    await expect(page.locator("#notes")).toHaveValue(/G4/);
    await page.locator("#keyboard-mode-add").click();
});

test("quantizes exported notes to the selected scale", async ({ pwaPage: page }) => {
    await startAudio(page);

    await page.locator("input[name='octave-range'][value='1']").check({ force: true });
    await page.locator("#loop-count").fill("1");
    await page.locator("#scale-root").selectOption("C");
    await page.locator("#scale-type").selectOption("major");
    await page.locator("#scale-quantize-toggle").check();
    await page.locator("#notes").fill("C4 D4 E4 F4 G#4");
    await page.locator("#notes").dispatchEvent("change");

    await expect(page.locator("#scale-quantize-toggle")).toBeChecked();
    await expect(page.locator("#notes")).toHaveValue("C4 D4 E4 F4 G#4");
    const download = await downloadCurrentPatternMidi(page);
    expect(extractMidiNoteOns(download.bytes)).toEqual([60, 62, 64, 65, 67]);
});

test("keeps the scale type and quantization toggle synchronized", async ({ pwaPage: page }) => {
    await startAudio(page);

    const quantizeToggle = page.locator("#scale-quantize-toggle");
    const scaleType = page.locator("#scale-type");
    const status = page.locator("#scale-quantize-toggle-status");

    await scaleType.selectOption("chromatic");
    await expect(quantizeToggle).not.toBeChecked();
    await expect(status).toHaveText("Disabled");
    await expect(scaleType).toBeEnabled();

    await scaleType.selectOption("minor");
    await expect(quantizeToggle).toBeChecked();
    await expect(status).toHaveText("Enabled");

    await quantizeToggle.uncheck();
    await expect(scaleType).toHaveValue("minor");
    await expect(scaleType).toBeEnabled();

    await quantizeToggle.check();
    await expect(scaleType).toHaveValue("minor");
});

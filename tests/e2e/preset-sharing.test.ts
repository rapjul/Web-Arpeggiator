import { dismissOnboarding, expect, test } from "./fixtures/app";

test("copies a share URL containing the public preset parameters", async ({ pwaPage: page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await dismissOnboarding(page);

    await page.locator("#bpm").fill("195");
    await page.locator("#notes").fill("D4 F4 A4");
    await page.locator("#notes").dispatchEvent("change");
    await page.locator("#synth-type").selectOption("fmSynth");
    await page.locator("#waveform-buttons button[data-wave='square']").click();
    await page.locator("#harmonicity").fill("2.5");
    await page.locator("#modulation-index").fill("15");
    await page.locator("#scale-root").selectOption("D");
    await page.locator("#scale-type").selectOption("minor");
    await page.locator("#octave-range-buttons input[value='3']").locator("xpath=..").click();

    await page.locator("#share-preset-button").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe("");

    const copiedUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(copiedUrl.searchParams.get("bpm")).toBe("195");
    expect(copiedUrl.searchParams.get("seed")).toMatch(/^\d+$/);
    expect(copiedUrl.searchParams.get("notes")).toBe("D4 F4 A4");
    expect(copiedUrl.searchParams.get("synth")).toBe("fmSynth");
    expect(copiedUrl.searchParams.get("wave")).toBe("square");
    expect(copiedUrl.searchParams.get("harm")).toBe("2.5");
    expect(copiedUrl.searchParams.get("mod")).toBe("15.0");
    expect(copiedUrl.searchParams.get("quant")).toBe("true");
    expect(copiedUrl.searchParams.get("root")).toBe("D");
    expect(copiedUrl.searchParams.get("scale")).toBe("minor");
    expect(copiedUrl.searchParams.get("range")).toBe("3");
});

test("restores a complete shared preset after audio activation", async ({ pwaPage: page }) => {
    await page.goto(
        "/index.html?pwa=true&bpm=195&notes=D4%20F4%20A4&synth=fmSynth&wave=square&harm=2.5&mod=15.0&quant=true&root=D&scale=minor&range=3",
        { waitUntil: "domcontentloaded" },
    );

    await expect(page.locator("#bpm")).toHaveValue("195");
    await expect(page.locator("#notes")).toHaveValue("D4 F4 A4");
    await expect(page.locator("#synth-type")).toHaveValue("fmSynth");
    await expect(page.locator("#waveform-buttons button[data-wave='square']")).toHaveClass(
        /selected/,
    );
    await expect(page.locator("#harmonicity")).toHaveValue("2.5");
    await expect(page.locator("#modulation-index")).toHaveValue("15");
    await expect(page.locator("#scale-quantize-toggle")).toBeChecked();
    await expect(page.locator("#scale-root")).toHaveValue("D");
    await expect(page.locator("#scale-type")).toHaveValue("minor");
    await expect(page.locator("#octave-range-buttons input[value='3']")).toBeChecked();

    await dismissOnboarding(page);
    await page.locator("#play-stop").click();
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
});

test("clamps out-of-range shared preset values", async ({ pwaPage: page }) => {
    await page.goto("/index.html?pwa=true&bpm=999&gain=100&harm=99.9&range=10", {
        waitUntil: "domcontentloaded",
    });

    await expect(page.locator("#bpm")).toHaveValue("240");
    await expect(page.locator("#post-gain")).toHaveValue("0");
    await expect(page.locator("#harmonicity")).toHaveValue("10");
    await expect(page.locator("#octave-range-buttons input[value='5']")).toBeChecked();

    await dismissOnboarding(page);
    await page.locator("#play-stop").click();
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
});

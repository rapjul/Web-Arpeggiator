import { dismissOnboarding, expect, test } from "./fixtures/app";

test("copies a share URL containing the public preset parameters", async ({ pwaPage: page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await dismissOnboarding(page);

    await page.locator("#share-preset-button").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe("");

    const copiedUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    expect(copiedUrl.searchParams.has("bpm")).toBe(true);
    expect(copiedUrl.searchParams.has("notes")).toBe(true);
    expect(copiedUrl.searchParams.has("synth")).toBe(true);
});

test("restores a complete shared preset after audio activation", async ({ pwaPage: page }) => {
    await page.goto(
        "/index.html?pwa=true&bpm=195&notes=D4%20F4%20A4&synth=fmSynth&wave=square&harm=2.5&mod=15.0&quant=true&root=D&scale=minor",
        { waitUntil: "domcontentloaded" },
    );

    await expect(page.locator("#bpm")).toHaveValue("195");
    await expect(page.locator("#notes")).toHaveValue("D4 F4 A4");
    await expect(page.locator("#synth-type")).toHaveValue("fmSynth");
    await expect(page.locator("#scale-root")).toHaveValue("D");
    await expect(page.locator("#scale-type")).toHaveValue("minor");

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

    await dismissOnboarding(page);
    await page.locator("#play-stop").click();
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
});

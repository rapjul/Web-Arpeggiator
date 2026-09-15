import { expect, readPersistedSession, startAudio, test } from "./fixtures/app";

test("shows FM controls and preserves configured synthesis and envelope values", async ({
    pwaPage: page,
}) => {
    await startAudio(page);

    await page.locator("#synth-type").selectOption("fmSynth");
    await expect(page.locator("#advanced-synth-params")).toBeVisible();
    await expect(page.locator("#synth-type")).toHaveValue("fmSynth");

    await page.locator("#harmonicity").fill("5.5");
    await page.locator("#modulation-index").fill("22.4");
    await page.locator("#env-attack").fill("0.45");
    await page.locator("#env-release").fill("2.15");
    await expect(page.locator("#harmonicity")).toHaveValue("5.5");
    await expect(page.locator("#modulation-index")).toHaveValue("22.4");
    await expect(page.locator("#env-attack")).toHaveValue("0.45");
    await expect(page.locator("#env-release")).toHaveValue("2.15");
    await expect
        .poll(() => readPersistedSession(page))
        .toMatchObject({
            synthType: "fmSynth",
            harmonicity: 5.5,
            modulationIndex: 22.4,
            envAttack: 0.45,
            envRelease: 2.15,
        });
});

test("shows the selected synthesis controls and waveform affordances", async ({
    pwaPage: page,
}) => {
    await startAudio(page);

    const synthCases = [
        { type: "monoSynth", panel: "#mono-synth-params", waveformDisabled: false },
        { type: "duoSynth", panel: "#duo-synth-params", waveformDisabled: false },
        { type: "pluckSynth", panel: "#pluck-synth-params", waveformDisabled: true },
        { type: "membraneSynth", panel: "#membrane-synth-params", waveformDisabled: false },
    ];
    const sine = page.locator("button[data-wave='sine']");
    const pluckOverlay = page.locator("#waveform-pluck-overlay");

    for (const synthCase of synthCases) {
        await page.locator("#synth-type").selectOption(synthCase.type);
        await expect(page.locator("#synth-type")).toHaveValue(synthCase.type);
        await expect(page.locator(synthCase.panel)).toBeVisible();
        if (synthCase.waveformDisabled) {
            await expect(sine).toBeDisabled();
            await expect(pluckOverlay).toBeVisible();
        } else {
            await expect(sine).toBeEnabled();
            await expect(pluckOverlay).toBeHidden();
        }
    }
});

test("persists filter and studio effects controls", async ({ pwaPage: page }) => {
    await startAudio(page);

    await page.locator("#filter-cutoff").fill("2500");
    await page.locator("#delay-mix").fill("0.45");
    await page.locator("#drive-mix").fill("0.65");
    await page.locator("#chorus-mix").fill("0.5");
    await page.locator("#autopan-mix").fill("0.75");

    await expect(page.locator("#filter-cutoff")).toHaveValue("2500");
    await expect(page.locator("#delay-mix")).toHaveValue("0.45");
    await expect(page.locator("#drive-mix")).toHaveValue("0.65");
    await expect(page.locator("#chorus-mix")).toHaveValue("0.5");
    await expect(page.locator("#autopan-mix")).toHaveValue("0.75");
    await expect
        .poll(() => readPersistedSession(page))
        .toMatchObject({
            filterCutoff: 2500,
            delayMix: 0.45,
            driveMix: 0.65,
            chorusMix: 0.5,
            autoPanMix: 0.75,
        });
});

import { expect, readPersistedSession, startAudio, test } from "./fixtures/app";

test("updates slider feedback immediately and persists debounced settings", async ({
    pwaPage: page,
}) => {
    await startAudio(page);

    await page.locator("#filter-cutoff").fill("5000");
    await expect(page.locator("#filter-cutoff-value")).toHaveText("5000");
    await expect(page.locator("#filter-cutoff")).toHaveValue("5000");

    await page.locator("#bpm").fill("180");
    await expect(page.locator("#bpm-value")).toHaveText("180");
    await expect(page.locator("#bpm")).toHaveValue("180");

    await page.locator("#gate").fill("0.35");
    await expect(page.locator("#gate-value")).toHaveText("0.35");
    await expect(page.locator("#gate")).toHaveValue("0.35");

    await expect
        .poll(() => readPersistedSession(page))
        .toMatchObject({ filterCutoff: 5000, bpm: 180, gateRatio: 0.35 });
});

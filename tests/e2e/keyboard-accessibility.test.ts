import { expect, startAudio, test, type Page } from "./fixtures/app";

async function expectArrowNavigation(
    page: Page,
    selector: string,
    forwardKey: "ArrowRight" | "ArrowDown" = "ArrowRight",
): Promise<void> {
    const controls = page.locator(selector);
    const count = await controls.count();
    expect(count).toBeGreaterThanOrEqual(2);

    await controls.first().focus();
    await page.keyboard.press(forwardKey);
    await expect(controls.nth(1)).toBeFocused();

    await controls.first().focus();
    await page.keyboard.press("ArrowLeft");
    await expect(controls.nth(count - 1)).toBeFocused();

    await controls.nth(count - 1).focus();
    await page.keyboard.press("ArrowRight");
    await expect(controls.first()).toBeFocused();
}

test("moves between pattern controls with arrow keys and wraps at each end", async ({
    pwaPage: page,
}) => {
    await startAudio(page);

    await expectArrowNavigation(page, "#pattern-buttons input[type='radio']");
    const controls = page.locator("#pattern-buttons input[type='radio']");
    await controls.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(controls.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(controls.first()).toBeFocused();
});

test("moves between waveform and octave controls with arrow keys", async ({ pwaPage: page }) => {
    await startAudio(page);

    await expectArrowNavigation(page, "#waveform-buttons button.waveform-btn");
    await expectArrowNavigation(page, "#octave-shift-buttons input[type='radio']");
    await expectArrowNavigation(page, "#octave-range-buttons input[type='radio']");
});

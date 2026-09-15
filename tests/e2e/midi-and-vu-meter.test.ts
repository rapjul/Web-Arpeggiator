import { downloadCurrentPatternMidi, expect, startAudio, test, type Page } from "./fixtures/app";

function expectStandardMidiFile(bytes: Uint8Array): void {
    expect(bytes.byteLength).toBeGreaterThanOrEqual(20);
    expect([...bytes.slice(0, 4)]).toEqual([0x4d, 0x54, 0x68, 0x64]);
    expect([...bytes.slice(8, 12)]).toEqual([0, 0, 0, 1]);
    expect([...bytes.slice(14, 18)]).toEqual([0x4d, 0x54, 0x72, 0x6b]);
}

async function expectMeterToBeIdle(page: Page): Promise<void> {
    await expect(page.locator("#vu-db-value")).toHaveText("-- dB");
    await expect(page.locator("#vu-meter-bar")).toHaveAttribute("aria-valuetext", "Idle");
}

test("downloads a decodable Standard MIDI pattern file", async ({ pwaPage: page }) => {
    await startAudio(page);

    const download = await downloadCurrentPatternMidi(page);

    expect(download.filename).toMatch(/\.mid$/);
    expectStandardMidiFile(download.bytes);
});

test("presents accessible meter controls and reacts to playback", async ({ pwaPage: page }) => {
    await startAudio(page);

    const postGain = page.locator("#post-gain");
    const postGainValue = page.locator("#post-gain-value");
    const meter = page.locator("#vu-meter-bar");
    const clipContainer = page.locator("#vu-clip-container");
    const clipButton = page.locator("#vu-clip-indicator");
    const clipTooltip = page.locator("#vu-clip-tooltip");
    const infoButton = page.locator("#vu-info-button");
    const infoTooltip = page.locator("#vu-info-tooltip");

    await postGain.fill("-6");
    await expect(postGainValue).toHaveText("85");
    await expect(meter.locator("xpath=..")).toHaveClass(/h-5/);
    await expect(page.locator("#vu-scale-ticks")).toContainText("-60");
    await expect(page.locator("#vu-scale-ticks")).toContainText("0");

    await expect(meter).toHaveAttribute("role", "meter");
    await expect(meter).toHaveAttribute("aria-label", "Final audio output peak level");
    await expect(clipButton).toHaveAttribute("aria-describedby", "vu-clip-tooltip");
    await expect(clipTooltip).toHaveAttribute("role", "tooltip");
    await expect(infoButton).toHaveAttribute("aria-describedby", "vu-info-tooltip");
    await expect(infoButton).toHaveAttribute("aria-label", "Final Audio Output info");
    await expect(infoTooltip).toHaveAttribute("role", "tooltip");

    await clipContainer.hover();
    await expect(clipTooltip).toBeVisible();
    await expect(clipTooltip).toHaveText("No clipping detected");
    await page.locator("#vu-meter-container").hover();
    await expect(clipTooltip).toBeHidden();

    await infoButton.hover();
    await expect(infoTooltip).toBeVisible();
    await expect(infoButton).toHaveAttribute("aria-expanded", "true");
    await page.locator("#vu-meter-container").hover();
    await expect(infoTooltip).toBeHidden();

    await infoButton.focus();
    await expect(infoTooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(infoTooltip).toBeHidden();
    await expect(infoButton).toHaveAttribute("aria-expanded", "false");

    await expect.poll(() => meter.getAttribute("aria-valuetext")).toMatch(/dBFS/);
    await expect
        .poll(async () => {
            const value = await meter.getAttribute("aria-valuenow");
            return value === null ? Number.NaN : Number(value);
        })
        .toBeLessThanOrEqual(0);

    await page.locator("#play-stop").click();
    await expectMeterToBeIdle(page);
});

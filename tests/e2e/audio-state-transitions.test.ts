import { captureDownload, expect, startAudio, test } from "./fixtures/app";

async function startRecording(page: import("@playwright/test").Page): Promise<void> {
    await page.locator("#record-button").click();
    await expect(page.locator("#record-button")).toHaveClass(/recording/);
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
}

async function stopRecording(page: import("@playwright/test").Page): Promise<void> {
    await page.locator("#record-button").click();
    await expect(page.locator("#record-button")).not.toHaveClass(/recording/);
    await expect(page.locator("#realtime-export-controls")).toBeVisible();
}

async function waitForRecordedAudio(page: import("@playwright/test").Page): Promise<void> {
    await expect(page.locator("#record-button")).toHaveText(/Stop Recording \(00:0[12]\./);
}

test("transitions transport and recording through their public controls", async ({
    pwaPage: page,
}) => {
    await startAudio(page);

    const playStop = page.locator("#play-stop");
    await page.locator("#play-stop").click();
    await expect(playStop).toHaveText("Restart Audio");

    await playStop.click();
    await expect(playStop).toHaveText("Stop Audio");

    await startRecording(page);
    await playStop.click();
    await expect(playStop).toHaveText("Restart Audio");
    await expect(page.locator("#record-button")).toHaveClass(/recording/);

    await playStop.click();
    await expect(playStop).toHaveText("Stop Audio");
    await expect(page.locator("#record-button")).toHaveClass(/recording/);

    await page.locator("[data-pattern='down']:not(input)").click();
    await page.locator("#bpm").fill("140");
    await page.locator("#filter-cutoff").fill("2500");
    await expect(page.locator("input[name='pattern-direction'][value='down']")).toBeChecked();
    await expect(page.locator("#bpm")).toHaveValue("140");
    await expect(page.locator("#filter-cutoff")).toHaveValue("2500");

    await stopRecording(page);
    await page.locator("#record-button").click();
    await expect(page.locator("#record-button")).toHaveClass(/recording/);
    await expect(page.locator("#realtime-export-controls")).toBeHidden();
});

test("exports a real-time WAV recording through the browser download API", async ({
    pwaPage: page,
}) => {
    await startAudio(page);
    await startRecording(page);
    await waitForRecordedAudio(page);
    await stopRecording(page);

    await page.locator("#realtime-export-mp3").uncheck();
    const download = await captureDownload(page, () =>
        page.locator("#realtime-export-button").click(),
    );

    expect(download.filename).toMatch(/\.wav$/);
    expect([...download.bytes.slice(0, 4)]).toEqual([0x52, 0x49, 0x46, 0x46]);
    await expect(page.locator("#realtime-record-status")).toHaveText("Export complete!");
});

test("renders and downloads a one-cycle offline WAV export", async ({ pwaPage: page }) => {
    await startAudio(page);

    await page.locator("#offline-export-mp3").uncheck();
    await page.locator("#loop-count").fill("1");
    await page.locator("#offline-export-tail-seconds").fill("0");

    const download = await captureDownload(page, () =>
        page.locator("#offline-export-button").click(),
    );

    expect(download.filename).toMatch(/\.wav$/);
    expect([...download.bytes.slice(0, 4)]).toEqual([0x52, 0x49, 0x46, 0x46]);
    await expect(page.locator("#offline-export-status")).toContainText("complete");
    await expect(page.locator("#offline-export-button")).toBeEnabled();
});

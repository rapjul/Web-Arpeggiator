import { captureDownload, expect, parsePcmWav, startAudio, test } from "./fixtures/app";

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

async function captureRecordedWav(
    page: import("@playwright/test").Page,
): Promise<ReturnType<typeof parsePcmWav>> {
    await startRecording(page);
    await waitForRecordedAudio(page);
    await stopRecording(page);
    await page.locator("#realtime-export-mp3").uncheck();
    const download = await captureDownload(page, () =>
        page.locator("#realtime-export-button").click(),
    );
    return parsePcmWav(download.bytes);
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
    const wav = parsePcmWav(download.bytes);
    expect(wav.channels).toBeGreaterThanOrEqual(1);
    expect(wav.sampleRate).toBeGreaterThanOrEqual(44_100);
    expect(wav.durationSeconds).toBeGreaterThan(0.5);
    expect(wav.firstAudibleFrame / wav.sampleRate).toBeLessThan(0.2);
    expect(wav.peak).toBeGreaterThan(0.002);
    expect(wav.rms).toBeGreaterThan(0.0001);
    await expect(page.locator("#realtime-record-status")).toHaveText("Export complete!");
});

test("exports a real-time MP3 recording through the browser download API", async ({
    pwaPage: page,
}) => {
    await startAudio(page);
    await startRecording(page);
    await waitForRecordedAudio(page);
    await stopRecording(page);

    await page.locator("#realtime-export-wav").uncheck();
    const download = await captureDownload(page, () =>
        page.locator("#realtime-export-button").click(),
    );

    expect(download.filename).toMatch(/\.mp3$/);
    expect(download.bytes[0]).toBe(0xff);
    expect(download.bytes[1] & 0xe0).toBe(0xe0);
    await expect(page.locator("#realtime-record-status")).toHaveText("Export complete!");
    const decoded = await page.evaluate(async (samples) => {
        const context = new AudioContext();
        try {
            const buffer = await context.decodeAudioData(new Uint8Array(samples).buffer);
            let peak = 0;
            for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
                for (const sample of buffer.getChannelData(channel))
                    peak = Math.max(peak, Math.abs(sample));
            }
            return { duration: buffer.duration, peak };
        } finally {
            await context.close();
        }
    }, Array.from(download.bytes));
    expect(decoded.duration).toBeGreaterThan(0.5);
    expect(decoded.peak).toBeGreaterThan(0.0001);
});

test("captures master post-gain changes in real-time WAV recordings", async ({ pwaPage: page }) => {
    await startAudio(page);
    await page.locator("#notes").fill("C4");
    await page.locator("#delay-mix").fill("0");
    await page.locator("#reverb-mix").fill("0");

    await page.locator("#post-gain").fill("-12");
    const louder = await captureRecordedWav(page);

    await page.locator("#post-gain").fill("-36");
    await expect
        .poll(async () => Number(await page.locator("#vu-meter-bar").getAttribute("aria-valuenow")))
        .toBeLessThanOrEqual(-30);
    const quieter = await captureRecordedWav(page);

    expect(louder.rms).toBeGreaterThan(0.0001);
    expect(quieter.rms).toBeLessThan(louder.rms * 0.25);
    expect(quieter.peak).toBeLessThan(louder.peak * 0.25);
});

test("renders and downloads a one-cycle offline WAV export", async ({ pwaPage: page }) => {
    await startAudio(page);

    await page.locator("#offline-export-mp3").uncheck();
    await page.locator("#loop-count").fill("1");
    await page.locator("#offline-export-tail-mode").selectOption("custom");
    await page.locator("#offline-export-tail-seconds").fill("0");

    const download = await captureDownload(page, () =>
        page.locator("#offline-export-button").click(),
    );

    expect(download.filename).toMatch(/\.wav$/);
    expect([...download.bytes.slice(0, 4)]).toEqual([0x52, 0x49, 0x46, 0x46]);
    await expect(page.locator("#offline-export-status")).toContainText("complete");
    await expect(page.locator("#offline-export-button")).toBeEnabled();
});

test("names an Auto-tail WAV with its effective rendered duration", async ({ pwaPage: page }) => {
    await startAudio(page);

    await page.locator("#offline-export-mp3").uncheck();
    await page.locator("#notes").fill("C4");
    await page.locator("#notes").dispatchEvent("change");
    await page.locator("input[name='octave-range'][value='1']").locator("xpath=..").click();
    await page.locator("#loop-count").fill("1");
    await page.locator("#env-release").fill("1.2");
    await page.locator("#delay-mix").fill("0");
    await page.locator("#reverb-mix").fill("0");

    const download = await captureDownload(page, () =>
        page.locator("#offline-export-button").click(),
    );
    const wav = parsePcmWav(download.bytes);

    expect(download.filename).toMatch(/tail-auto-1\.2s.*\.wav$/);
    expect(wav.durationSeconds).toBeCloseTo(1.325, 2);
});

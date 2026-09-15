import { expect, startAudio, test, type Page } from "./fixtures/app";

async function loopMapFingerprint(page: Page): Promise<string> {
    return page.locator("#visualizer-plot").evaluate((canvas) => {
        if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
            return "";
        }
        const context = canvas.getContext("2d");
        if (!context) return "";

        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let hasNoteLabel = false;
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index] === 56 && pixels[index + 1] === 189 && pixels[index + 2] === 248) {
                hasNoteLabel = true;
            }
            hash = Math.imul(hash ^ pixels[index], 16777619);
            hash = Math.imul(hash ^ pixels[index + 1], 16777619);
            hash = Math.imul(hash ^ pixels[index + 2], 16777619);
            hash = Math.imul(hash ^ pixels[index + 3], 16777619);
        }
        return hasNoteLabel ? `${canvas.width}:${canvas.height}:${hash >>> 0}` : "";
    });
}

async function expectLoopMapRerender(page: Page, previousFingerprint: string): Promise<string> {
    await expect.poll(() => loopMapFingerprint(page)).not.toBe(previousFingerprint);
    const nextFingerprint = await loopMapFingerprint(page);
    expect(nextFingerprint).not.toBe("");
    return nextFingerprint;
}

async function openAndEnableVisualizer(page: Page): Promise<void> {
    const details = page.locator("#visualizer-container").locator("xpath=ancestor::details");
    if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
    await page.locator("#visualizer-container").scrollIntoViewIfNeeded();
    await page.locator("#toggle-visualizer").click();
    await expect(page.locator("#toggle-visualizer")).toHaveText("Disable Visualizer");
}

test("renders every visualizer mode and its public zoom or window controls", async ({
    pwaPage: page,
}) => {
    await startAudio(page);
    await openAndEnableVisualizer(page);

    const mode = page.locator("#visualizer-mode");
    const zoom = page.locator("#visualizer-zoom");
    for (const visualizerMode of ["oscilloscope", "fft", "loopMap"]) {
        await mode.selectOption(visualizerMode);
        await expect(mode).toHaveValue(visualizerMode);
        await zoom.fill("1");
        await expect(zoom).toHaveValue("1");
        await zoom.fill("4");
        await expect(zoom).toHaveValue("4");
    }

    await mode.selectOption("oscilloscope");
    await page.locator("#oscilloscope-window").selectOption("250");
    await expect(page.locator("#oscilloscope-window")).toHaveValue("250");
    await page.locator("#oscilloscope-window").selectOption("1000");
    await expect(page.locator("#oscilloscope-window")).toHaveValue("1000");
});

test("rerenders the Loop Map canvas for every pattern-affecting public control", async ({
    pwaPage: page,
}) => {
    await startAudio(page);
    await openAndEnableVisualizer(page);
    await page.locator("#visualizer-mode").selectOption("loopMap");

    const initialFingerprint = await expectLoopMapRerender(page, "");
    await page.locator("#notes").fill("D3 F#3 A3");
    await page.locator("#notes").dispatchEvent("change");
    await expectLoopMapRerender(page, initialFingerprint);

    for (const range of ["1", "3", "5"]) {
        const rangeInput = page.locator(`#octave-range-buttons input[value='${range}']`);
        if (!(await rangeInput.isChecked())) await rangeInput.check({ force: true });
        await expect(rangeInput).toBeChecked();
    }
    for (const shift of ["-2", "0", "2"]) {
        const shiftInput = page.locator(`#octave-shift-buttons input[value='${shift}']`);
        if (!(await shiftInput.isChecked())) await shiftInput.check({ force: true });
        await expect(shiftInput).toBeChecked();
    }

    await page.locator("#pattern-buttons input[value='octaveCycle']").check({ force: true });
    await expect(page.locator("#pattern-buttons input[value='octaveCycle']")).toBeChecked();
    await page.locator("#scale-quantize-toggle").uncheck();
    await expect(page.locator("#scale-quantize-toggle")).not.toBeChecked();
    await page.locator("#scale-quantize-toggle").check();
    await expect(page.locator("#scale-quantize-toggle")).toBeChecked();
    await page.locator("#scale-root").selectOption("G");
    await expect(page.locator("#scale-root")).toHaveValue("G");
    await page.locator("#interval").selectOption("8n");
    await expect(page.locator("#interval")).toHaveValue("8n");
});

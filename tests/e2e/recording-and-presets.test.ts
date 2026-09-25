import { dismissOnboarding, expect, test, type Page } from "./fixtures/app";

const DATABASE_NAME = "web-arpeggiator-presets";

async function readSavedPreset(page: Page, name: string): Promise<unknown> {
    return page.evaluate(
        async ({ databaseName, presetName }) => {
            const database = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(databaseName);
                request.addEventListener("success", () => resolve(request.result));
                request.addEventListener("error", () => reject(request.error));
            });

            try {
                const transaction = database.transaction("presetSnapshots", "readonly");
                const snapshots = await new Promise<{ name?: string }[]>((resolve, reject) => {
                    const request = transaction.objectStore("presetSnapshots").getAll();
                    request.addEventListener("success", () => resolve(request.result));
                    request.addEventListener("error", () => reject(request.error));
                });
                return snapshots.find((snapshot) => snapshot.name === presetName) ?? null;
            } finally {
                database.close();
            }
        },
        { databaseName: DATABASE_NAME, presetName: name },
    );
}

test("switches offline export modes and persists their settings in a browser preset", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);

    const seamless = page.locator("#offline-export-mode-seamless");
    const tail = page.locator("#offline-export-mode-tail");
    const tailControl = page.locator("#offline-export-tail-control");
    const tailMode = page.locator("#offline-export-tail-mode");
    const tailSeconds = page.locator("#offline-export-tail-seconds");

    await expect(tail).toBeChecked();
    await expect(tailMode).toHaveValue("auto");
    await expect(tailSeconds).toHaveValue("2");
    await seamless.check();
    await expect(tailControl).toBeHidden();
    await expect(tailSeconds).toBeDisabled();
    await tail.check();
    await tailMode.selectOption("custom");
    await tailSeconds.fill("3.5");
    await expect(tailControl).toBeVisible();
    await expect(tailSeconds).toHaveValue("3.5");
    await expect(page.locator("#offline-export-mode-help")).toContainText("sample-exact for WAV");

    const presetName = "export settings browser preset";
    await page.locator("#preset-name-input").fill(presetName);
    await page.locator("#save-preset-to-browser-button").click();
    await expect(page.locator("#saved-preset-select")).toContainText(presetName);

    await expect
        .poll(async () => readSavedPreset(page, presetName))
        .toMatchObject({
            settings: {
                offlineExportMode: "tail",
                offlineExportTailMode: "custom",
                offlineExportTailSeconds: 3.5,
            },
        });
});

test("starts recording from idle and exposes its export controls when stopped", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);

    const recordButton = page.locator("#record-button");
    const playStop = page.locator("#play-stop");
    await recordButton.click();
    await expect(recordButton).toHaveClass(/recording/);
    await expect(playStop).toHaveText("Stop Audio");
    await expect(recordButton).toHaveText(/Stop Recording \(00:\d{2}\./);

    await recordButton.click();
    await expect(recordButton).not.toHaveClass(/recording/);
    await expect(page.locator("#realtime-export-controls")).toBeVisible();
});

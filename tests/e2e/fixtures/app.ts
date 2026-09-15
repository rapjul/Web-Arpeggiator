import { expect, test as base, type Download, type Page } from "@playwright/test";

const DATABASE_NAME = "web-arpeggiator-presets";
const STORES_TO_RESET = ["presetSnapshots", "lastSession"];

type AppFixtures = {
    pwaPage: Page;
};

export type DownloadedFile = {
    filename: string;
    bytes: Uint8Array;
};

/**
 * Opens the production-preview PWA and waits until its service worker controls
 * the page. A reload is required before a first-time registration controls the
 * current document.
 */
export async function openPwa(page: Page): Promise<void> {
    await page.goto("/index.html?pwa=true", { waitUntil: "domcontentloaded" });
    await expect
        .poll(() =>
            page.evaluate(async () => {
                const registration = await navigator.serviceWorker?.getRegistration("./");
                return registration !== undefined;
            }),
        )
        .toBe(true);
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker?.controller !== null))
        .toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#notes")).toBeVisible();
}

/**
 * Clears persisted UI state through browser platform APIs and reloads the app
 * so each scenario starts from the documented default note set.
 */
export async function resetAppState(page: Page): Promise<void> {
    await page.evaluate(
        async ({ databaseName, storesToReset }) => {
            localStorage.clear();

            const database = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(databaseName);
                request.addEventListener("success", () => resolve(request.result));
                request.addEventListener("error", () => reject(request.error));
            });

            try {
                const availableStores = storesToReset.filter((storeName) =>
                    database.objectStoreNames.contains(storeName),
                );
                if (availableStores.length === 0) return;

                const transaction = database.transaction(availableStores, "readwrite");
                for (const storeName of availableStores) transaction.objectStore(storeName).clear();
                await new Promise<void>((resolve, reject) => {
                    transaction.addEventListener("complete", () => resolve());
                    transaction.addEventListener("error", () => reject(transaction.error));
                    transaction.addEventListener("abort", () => reject(transaction.error));
                });
            } finally {
                database.close();
            }
        },
        { databaseName: DATABASE_NAME, storesToReset: STORES_TO_RESET },
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#notes")).toHaveValue("C4 E4 G4");
}

/**
 * Dismisses either public onboarding path and waits for the app controls to be
 * enabled by its user-gesture activation flow.
 */
export async function dismissOnboarding(page: Page): Promise<void> {
    const quickStartOverlay = page.locator("#quick-start-overlay");
    if (await quickStartOverlay.isVisible()) {
        await page.locator("#quick-start-scratch").click();
    } else {
        await expect(page.locator("#start-overlay")).toBeVisible();
        await page.locator("#start-overlay").click();
    }

    const playStop = page.locator("#play-stop");
    await expect(playStop).toBeEnabled();
}

/**
 * Uses the onboarding UI to satisfy the browser's user-gesture audio policy,
 * then starts playback at a quiet test volume.
 */
export async function startAudio(page: Page): Promise<void> {
    await dismissOnboarding(page);

    const playStop = page.locator("#play-stop");
    await page.locator("#post-gain").fill("-12");
    await playStop.click();
    await expect(playStop).toHaveText("Stop Audio");
}

/**
 * Captures a real browser download and returns its suggested filename and
 * bytes. Tests use this for export contracts instead of intercepting browser
 * globals such as URL.createObjectURL or anchor clicks.
 */
export async function captureDownload(
    page: Page,
    trigger: () => Promise<void>,
): Promise<DownloadedFile> {
    const downloadPromise = page.waitForEvent("download");
    await trigger();
    const download = await downloadPromise;
    return {
        filename: download.suggestedFilename(),
        bytes: await readDownloadBytes(download),
    };
}

export async function downloadCurrentPatternMidi(page: Page): Promise<DownloadedFile> {
    return captureDownload(page, () => page.locator("#offline-export-midi-button").click());
}

export async function readPersistedSession(page: Page): Promise<Record<string, unknown> | null> {
    return page.evaluate(async (databaseName) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.addEventListener("success", () => resolve(request.result));
            request.addEventListener("error", () => reject(request.error));
        });

        try {
            if (!database.objectStoreNames.contains("lastSession")) return null;
            const transaction = database.transaction("lastSession", "readonly");
            const record = await new Promise<{ settings?: Record<string, unknown> } | undefined>(
                (resolve, reject) => {
                    const request = transaction.objectStore("lastSession").get("current");
                    request.addEventListener("success", () => resolve(request.result));
                    request.addEventListener("error", () => reject(request.error));
                },
            );
            return record?.settings ?? null;
        } finally {
            database.close();
        }
    }, DATABASE_NAME);
}

export function extractMidiNoteOns(bytes: Uint8Array): number[] {
    const notes: number[] = [];
    for (let index = 0; index <= bytes.length - 3; index += 1) {
        if (bytes[index] === 0x90 && bytes[index + 2] > 0) notes.push(bytes[index + 1]);
    }
    return notes;
}

async function readDownloadBytes(download: Download): Promise<Uint8Array> {
    const stream = await download.createReadStream();
    if (!stream) throw new Error(`Unable to read ${download.suggestedFilename()}.`);

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk as Uint8Array);

    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

/**
 * Native Playwright fixture for browser scenarios. Every test receives a
 * fresh PWA context and starts from its documented defaults.
 */
export const test = base.extend<AppFixtures>({
    pwaPage: async ({ page }, use) => {
        await openPwa(page);
        await resetAppState(page);
        await use(page);
    },
});

export { expect, type Page };

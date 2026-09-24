import { test as base, type Download, expect, type Page } from "@playwright/test";

const DATABASE_NAME = "web-arpeggiator-presets";
const STORES_TO_RESET = ["presetSnapshots", "lastSession"];

type AppFixtures = {
    pwaPage: Page;
};

export type DownloadedFile = {
    filename: string;
    bytes: Uint8Array;
};

export type ParsedWav = {
    channels: number;
    durationSeconds: number;
    firstAudibleFrame: number;
    peak: number;
    rms: number;
    sampleRate: number;
};

/** Parses the PCM payload needed to validate browser-recorded WAV artifacts. */
export function parsePcmWav(bytes: Uint8Array): ParsedWav {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
    if (ascii(0) !== "RIFF" || ascii(8) !== "WAVE") throw new Error("Expected RIFF/WAVE file.");

    let channels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let dataOffset = 0;
    let dataLength = 0;
    for (let offset = 12; offset + 8 <= bytes.length; ) {
        const id = ascii(offset);
        const length = view.getUint32(offset + 4, true);
        const payloadOffset = offset + 8;
        if (payloadOffset + length > bytes.length) throw new Error("Truncated WAV chunk.");
        if (id === "fmt ") {
            if (view.getUint16(payloadOffset, true) !== 1) throw new Error("Expected PCM WAV.");
            channels = view.getUint16(payloadOffset + 2, true);
            sampleRate = view.getUint32(payloadOffset + 4, true);
            bitsPerSample = view.getUint16(payloadOffset + 14, true);
        }
        if (id === "data") {
            dataOffset = payloadOffset;
            dataLength = length;
        }
        offset = payloadOffset + length + (length % 2);
    }
    if (
        !channels ||
        !sampleRate ||
        bitsPerSample !== 16 ||
        !dataLength ||
        dataLength % (channels * 2) !== 0
    ) {
        throw new Error("Expected 16-bit PCM WAV data.");
    }

    const frameCount = dataLength / (channels * 2);
    let firstAudibleFrame = frameCount;
    let sumSquares = 0;
    let peak = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
            const sample =
                view.getInt16(dataOffset + (frame * channels + channel) * 2, true) / 32768;
            if (!Number.isFinite(sample)) throw new Error("WAV contains a non-finite PCM sample.");
            if (Math.abs(sample) > 0.002) firstAudibleFrame = Math.min(firstAudibleFrame, frame);
            peak = Math.max(peak, Math.abs(sample));
            sumSquares += sample * sample;
        }
    }
    return {
        channels,
        durationSeconds: frameCount / sampleRate,
        firstAudibleFrame,
        peak,
        rms: Math.sqrt(sumSquares / (frameCount * channels)),
        sampleRate,
    };
}

/**
 * Opens the production-preview PWA and waits until its service worker controls
 * the reloaded page. A first-time registration cannot control the document
 * that created it, so control is checked only after that navigation.
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
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker?.controller !== null))
        .toBe(true);
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
    const startOverlay = page.locator("#start-overlay");
    const playStop = page.locator("#play-stop");
    await expect
        .poll(async () => {
            if (await quickStartOverlay.isVisible()) return "quick-start";
            if (await startOverlay.isVisible()) return "start-overlay";
            return (await playStop.isEnabled()) ? "ready" : "";
        })
        .not.toBe("");

    if (await quickStartOverlay.isVisible()) {
        await page.locator("#quick-start-scratch").click();
    } else if (await startOverlay.isVisible()) {
        await startOverlay.click();
    }

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
        const asynchronousFailures: string[] = [];
        page.on("pageerror", (error) => asynchronousFailures.push(error.message));
        await page.addInitScript(() => {
            window.addEventListener("unhandledrejection", (event) => {
                throw event.reason instanceof Error
                    ? event.reason
                    : new Error(String(event.reason));
            });
        });
        await openPwa(page);
        await resetAppState(page);
        await use(page);
        expect(asynchronousFailures, "page errors and unhandled rejections").toEqual([]);
    },
});

export { expect, type Page };

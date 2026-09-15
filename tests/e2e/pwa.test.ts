import {
    dismissOnboarding,
    expect,
    resetAppState,
    startAudio,
    test,
    type Page,
} from "./fixtures/app";

const DATABASE_NAME = "web-arpeggiator-presets";
const APP_CACHE_PREFIX = "web-arpeggiator-";

async function readSessionNotes(page: Page): Promise<string | null> {
    return page.evaluate(async (databaseName) => {
        type SessionRecord = { settings?: { baseNotes?: unknown } };

        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(databaseName);
            request.addEventListener("success", () => resolve(request.result));
            request.addEventListener("error", () => reject(request.error));
        });

        try {
            if (!database.objectStoreNames.contains("lastSession")) return null;

            const transaction = database.transaction("lastSession", "readonly");
            const record = await new Promise<SessionRecord | undefined>((resolve, reject) => {
                const request = transaction.objectStore("lastSession").get("current");
                request.addEventListener("success", () => resolve(request.result));
                request.addEventListener("error", () => reject(request.error));
            });
            return Array.isArray(record?.settings?.baseNotes)
                ? record.settings.baseNotes.join(" ")
                : null;
        } finally {
            database.close();
        }
    }, DATABASE_NAME);
}

async function createPartialSessionSchema(page: Page): Promise<void> {
    await page.evaluate(async (databaseName) => {
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(databaseName);
            request.addEventListener("success", () => resolve());
            request.addEventListener("error", () => reject(request.error));
            request.addEventListener("blocked", () =>
                reject(new Error("Database deletion was blocked.")),
            );
        });

        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.addEventListener("upgradeneeded", () => {
                request.result
                    .createObjectStore("lastSession", { keyPath: "id" })
                    .put({ id: "current", settings: { baseNotes: ["A0", "C8"] } });
            });
            request.addEventListener("success", () => resolve(request.result));
            request.addEventListener("error", () => reject(request.error));
        });
        database.close();
    }, DATABASE_NAME);
}

async function loadedJavaScriptModulesAreCached(page: Page): Promise<boolean> {
    return page.evaluate(async () => {
        const moduleUrls = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((url) => {
                const resourceUrl = new URL(url);
                return (
                    resourceUrl.origin === location.origin &&
                    resourceUrl.pathname.startsWith("/assets/") &&
                    resourceUrl.pathname.endsWith(".js")
                );
            });
        const cacheEntries = await Promise.all(
            (await caches.keys()).map(async (cacheName) => (await caches.open(cacheName)).keys()),
        );
        const cachedUrls = new Set(cacheEntries.flat().map((request) => request.url));
        return moduleUrls.length > 1 && moduleUrls.every((url) => cachedUrls.has(url));
    });
}

async function sendServiceWorkerMessage(page: Page, type: string): Promise<void> {
    await page.evaluate(async (messageType) => {
        const registration = await navigator.serviceWorker.ready;
        const worker =
            registration.waiting || registration.active || navigator.serviceWorker.controller;
        if (!worker) throw new Error("Missing active service worker.");

        await new Promise<void>((resolve, reject) => {
            const messageId = `pwa-test-${crypto.randomUUID()}`;
            const timeoutId = window.setTimeout(() => {
                navigator.serviceWorker.removeEventListener("message", onMessage);
                reject(new Error(`Timed out waiting for ${messageType}.`));
            }, 5_000);
            const onMessage = (
                event: MessageEvent<{ messageId?: string; ok?: boolean; error?: string }>,
            ) => {
                if (event.data?.messageId !== messageId) return;
                window.clearTimeout(timeoutId);
                navigator.serviceWorker.removeEventListener("message", onMessage);
                if (event.data.ok === false) {
                    reject(
                        new Error(event.data.error || `Service worker rejected ${messageType}.`),
                    );
                    return;
                }
                resolve();
            };

            navigator.serviceWorker.addEventListener("message", onMessage);
            worker.postMessage({ type: messageType, messageId });
        });
    }, type);
}

test("loads a complete PWA shell under an active service worker", async ({ pwaPage }) => {
    const manifest = await pwaPage.evaluate(async () => {
        const response = await fetch("./manifest.webmanifest");
        return response.json() as Promise<{
            display?: string;
            icons?: unknown[];
            name?: string;
            start_url?: string;
        }>;
    });

    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBeTruthy();
    expect(manifest.icons).toEqual(expect.any(Array));
    expect(manifest.icons).not.toHaveLength(0);
    await expect
        .poll(() => pwaPage.evaluate(() => navigator.serviceWorker.controller !== null))
        .toBe(true);
});

test("resets the existing session store in a partial IndexedDB schema", async ({ pwaPage }) => {
    await createPartialSessionSchema(pwaPage);
    await resetAppState(pwaPage);

    await expect(pwaPage.locator("#notes")).toHaveValue("C4 E4 G4");
});

test("saves, restores, and removes browser presets while persisting the session", async ({
    pwaPage,
}) => {
    const notes = pwaPage.locator("#notes");
    const presetName = pwaPage.locator("#preset-name-input");
    const presetSelect = pwaPage.locator("#saved-preset-select");
    const presetLabel = "PWA browser preset";

    await dismissOnboarding(pwaPage);
    await notes.fill("C4 D4 F4");
    await notes.dispatchEvent("change");
    await presetName.fill(presetLabel);
    await pwaPage.locator("#save-preset-to-browser-button").click();
    await expect(presetSelect).toContainText(presetLabel);

    const savedPreset = presetSelect.locator("option", { hasText: presetLabel });
    await presetSelect.selectOption((await savedPreset.getAttribute("value")) ?? "");
    await pwaPage.locator("#load-saved-preset-button").click();
    await expect(notes).toHaveValue("C4 D4 F4");

    await pwaPage.locator("#delete-saved-preset-button").click();
    await expect(presetSelect).not.toContainText(presetLabel);

    await notes.fill("E4 G4 B4");
    await notes.dispatchEvent("change");
    await expect.poll(() => readSessionNotes(pwaPage)).toBe("E4 G4 B4");

    await pwaPage.reload({ waitUntil: "domcontentloaded" });
    await expect(notes).toHaveValue("E4 G4 B4");
});

test("preloads audio modules online and runs the cached PWA offline", async ({ pwaPage }) => {
    await startAudio(pwaPage);
    await pwaPage.locator("#play-stop").click();
    await expect
        .poll(() => loadedJavaScriptModulesAreCached(pwaPage), { timeout: 30_000 })
        .toBe(true);

    await pwaPage.context().setOffline(true);
    try {
        await pwaPage.reload({ waitUntil: "domcontentloaded" });
        await expect(pwaPage.locator("#notes")).toBeVisible();
        await expect(pwaPage.locator("#visualizer-plot")).toHaveCount(1);

        await startAudio(pwaPage);
        await pwaPage.locator("#play-stop").click();
        await expect(pwaPage.locator("#play-stop")).toHaveText("Restart Audio");
    } finally {
        await pwaPage.context().setOffline(false);
    }
});

test("clears PWA caches through the service worker control API", async ({ pwaPage }) => {
    await expect
        .poll(() => pwaPage.evaluate(() => caches.keys()))
        .toEqual(
            expect.arrayContaining([expect.stringMatching(new RegExp(`^${APP_CACHE_PREFIX}`))]),
        );

    await sendServiceWorkerMessage(pwaPage, "clearCaches");
    await expect
        .poll(() => pwaPage.evaluate(() => caches.keys()))
        .not.toEqual(
            expect.arrayContaining([expect.stringMatching(new RegExp(`^${APP_CACHE_PREFIX}`))]),
        );
});

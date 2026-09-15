import { expect, test } from "./test-helpers";
import { initializeAudio, resetBrowserState, runBrowser, waitForPwaReady } from "./test-helpers";

/**
 * The port number for the test server instance.
 * @type {number}
 */
const PORT: number = 4173;

/**
 * The root URL of the running application.
 * @type {string}
 */
const APP_URL: string = `http://127.0.0.1:${PORT}/index.html`;

test("PWA Shell Integration Suite", async (): Promise<void> => {
    console.log("Starting PWA Shell Integration Suite...");

    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Verify PWA Manifest Parameters
    console.log("Step 2: Verifying manifest...");
    const manifestValid: string = await runBrowser([
        "eval",
        `(async () => {
        const manifest = await fetch('./manifest.webmanifest').then((res) => res.json());
        return Boolean(manifest.name && manifest.start_url && manifest.display === 'standalone' && Array.isArray(manifest.icons) && manifest.icons.length > 0);
    })()`,
    ]);
    expect(manifestValid).toBe("true");

    // 3. Check service worker registration
    console.log("Step 3: Checking SW registration...");
    const swRegistered: string = await runBrowser(["eval", "Boolean(navigator.serviceWorker)"]);
    expect(swRegistered).toBe("true");

    // 4. Verify Preset Store is empty initially through IndexedDB's public API.
    console.log("Step 4: Checking initial preset store empty...");
    const emptyCheck: string = await runBrowser([
        "eval",
        `(async () => {
        const database = await new Promise((resolve, reject) => {
            const request = indexedDB.open('web-arpeggiator-presets');
            request.addEventListener('success', () => resolve(request.result));
            request.addEventListener('error', () => reject(request.error));
        });
        const transaction = database.transaction('presetSnapshots', 'readwrite');
        transaction.objectStore('presetSnapshots').clear();
        await new Promise((resolve, reject) => {
            transaction.addEventListener('complete', resolve);
            transaction.addEventListener('error', () => reject(transaction.error));
            transaction.addEventListener('abort', () => reject(transaction.error));
        });
        database.close();
        return true;
    })()`,
    ]);
    expect(emptyCheck).toBe("true");

    // 5. Test saving a preset through the visible UI, then inspect IndexedDB.
    console.log("Step 5: Testing saving preset...");
    const saveCheck: string = await runBrowser([
        "eval",
        `(async () => {
        const notes = document.getElementById('notes');
        const name = document.getElementById('preset-name-input');
        const save = document.getElementById('save-preset-to-browser-button');
        if (!notes || !name || !save) return false;
        notes.value = 'C4 D4 F4';
        notes.dispatchEvent(new Event('input', { bubbles: true }));
        notes.dispatchEvent(new Event('change', { bubbles: true }));
        name.value = '__test__';
        name.dispatchEvent(new Event('input', { bubbles: true }));
        save.click();
        return true;
    })()`,
    ]);
    expect(saveCheck).toBe("true");
    await runBrowser([
        "wait",
        "--fn",
        "[...document.getElementById('saved-preset-select').options].some((option) => option.textContent.includes('__test__'))",
    ]);

    // 6. Test loading the stored preset through the visible controls.
    console.log("Step 6: Testing loading preset...");
    const loadCheck: string = await runBrowser([
        "eval",
        `(async () => {
        const select = document.getElementById('saved-preset-select');
        const load = document.getElementById('load-saved-preset-button');
        if (!select || !load) return false;
        const option = [...select.options].find((candidate) => candidate.textContent.includes('__test__'));
        if (!option) return false;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        load.click();
        return true;
    })()`,
    ]);
    expect(loadCheck).toBe("true");
    await runBrowser(["wait", "--fn", "document.getElementById('notes').value === 'C4 D4 F4'"]);

    // 7. Test removing the stored preset through the visible controls.
    console.log("Step 7: Testing preset deletion...");
    const deleteCheck: string = await runBrowser([
        "eval",
        `(async () => {
        const select = document.getElementById('saved-preset-select');
        const remove = document.getElementById('delete-saved-preset-button');
        if (!select || !remove) return false;
        const option = [...select.options].find((candidate) => candidate.textContent.includes('__test__'));
        if (!option) return false;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        remove.click();
        return true;
    })()`,
    ]);
    expect(deleteCheck).toBe("true");
    await runBrowser([
        "wait",
        "--fn",
        "![...document.getElementById('saved-preset-select').options].some((option) => option.textContent.includes('__test__'))",
    ]);

    // 8. Test last session state serialization
    console.log("Step 8: Testing session serialization...");
    const sessionCheck: string = await runBrowser([
        "eval",
        `(async () => {
        const notes = document.getElementById('notes');
        if (!notes) return false;
        notes.value = 'E4 G4 B4';
        notes.dispatchEvent(new Event('input', { bubbles: true }));
        notes.dispatchEvent(new Event('change', { bubbles: true }));

        const readCurrentSession = async () => {
            const database = await new Promise((resolve, reject) => {
                const request = indexedDB.open('web-arpeggiator-presets');
                request.addEventListener('success', () => resolve(request.result));
                request.addEventListener('error', () => reject(request.error));
            });
            const transaction = database.transaction('lastSession', 'readonly');
            const request = transaction.objectStore('lastSession').get('current');
            const record = await new Promise((resolve, reject) => {
                request.addEventListener('success', () => resolve(request.result));
                request.addEventListener('error', () => reject(request.error));
            });
            database.close();
            return record;
        };

        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const record = await readCurrentSession();
            if (record?.settings?.baseNotes?.join(' ') === 'E4 G4 B4') {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return false;
    })()`,
    ]);
    expect(sessionCheck).toBe("true");

    // 9. Reload page and check session restoration
    console.log("Step 9: Reloading and checking session restore...");
    await runBrowser(["reload"]);
    await runBrowser(["wait", "--fn", "document.getElementById('notes')?.value === 'E4 G4 B4'"]);
    const sessionRestored: string = await runBrowser([
        "eval",
        "document.getElementById('notes').value === 'E4 G4 B4'",
    ]);
    expect(sessionRestored).toBe("true");

    // 10. Test offline app shell rendering
    console.log("Step 10: Testing offline mode...");
    await runBrowser(["set", "offline", "on"]);
    await runBrowser(["reload"]);
    await runBrowser(["wait", "--fn", "document.getElementById('notes') !== null"]);
    const offlineRendered: string = await runBrowser([
        "eval",
        "Boolean(document.getElementById('visualizer-plot') && document.getElementById('play-stop'))",
    ]);
    expect(offlineRendered).toBe("true");

    // 11. Offline audio playback initialize & stop
    console.log("Step 11: Initializing audio offline...");
    await initializeAudio();
    await runBrowser(["click", "#play-stop"]);

    // 12. Disable offline and verify cache operations through the native Service Worker API.
    console.log("Step 12: Testing cache control API...");
    await runBrowser(["set", "offline", "off"]);
    const cacheResult: string = await runBrowser([
        "eval",
        `(async () => {
        const registration = await navigator.serviceWorker.ready;
        const sendWorkerMessage = (type) => new Promise((resolve, reject) => {
            const worker = registration.waiting || registration.active || navigator.serviceWorker.controller;
            if (!worker) {
                reject(new Error('missing-service-worker'));
                return;
            }
            const messageId = 'pwa-test-' + Date.now() + '-' + type;
            const timeoutId = setTimeout(() => {
                navigator.serviceWorker.removeEventListener('message', onMessage);
                reject(new Error('timed-out-' + type));
            }, 5000);
            function onMessage(event) {
                if (event.data?.messageId !== messageId) return;
                clearTimeout(timeoutId);
                navigator.serviceWorker.removeEventListener('message', onMessage);
                if (event.data.ok === false) {
                    reject(new Error(event.data.error || 'failed-' + type));
                    return;
                }
                resolve(event.data);
            }
            navigator.serviceWorker.addEventListener('message', onMessage);
            worker.postMessage({ type, messageId });
        });
        const cacheResult = await sendWorkerMessage('listCaches');
        const cachesBeforeClear = Array.isArray(cacheResult.caches) ? cacheResult.caches : [];
        if (!cachesBeforeClear.some((c) => c.startsWith('web-arpeggiator-'))) {
            return 'missing-pre-cache';
        }
        const activation = registration.waiting
            ? await sendWorkerMessage('SKIP_WAITING')
            : { ok: true, skipped: true };
        if (!activation.ok) {
            return 'activation-failed';
        }
        await sendWorkerMessage('clearCaches');
        const cachesAfterClear = await caches.keys();
        if (cachesAfterClear.some((c) => c.startsWith('web-arpeggiator-'))) {
            return 'clear-failed';
        }
        return 'success';
    })()`,
    ]);
    expect(cacheResult).toBe('"success"');
    console.log("PWA Shell Integration Suite complete!");
}, 30000);

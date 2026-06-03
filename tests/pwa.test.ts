import { test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type Subprocess } from "bun";
import { startTestServer, runBrowser, waitForPwaReady, initializeAudio, resetBrowserState, cleanupProcesses } from "./test-helpers";

/**
 * References the background server process.
 * @type {Subprocess|null}
 */
let serverProcess: Subprocess | null = null;

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

beforeAll(async (): Promise<void> => {
    // Clean up any stale browser processes from previous runs to release connection locks
    await spawn(["pkill", "-9", "-f", "agent-browser-chrome"]).exited;
    await spawn(["pkill", "-9", "-f", "agent-browser"]).exited;
    serverProcess = await startTestServer(PORT);
});

afterAll(async (): Promise<void> => {
    cleanupProcesses();
    await spawn(["pkill", "-9", "-f", "agent-browser-chrome"]).exited;
    await spawn(["pkill", "-9", "-f", "agent-browser"]).exited;
});

test("PWA Shell Integration Suite", async (): Promise<void> => {
    console.log("Starting PWA Shell Integration Suite...");

    // 1. Wait for PWA page and registration to complete
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Verify PWA Manifest Parameters
    console.log("Step 2: Verifying manifest...");
    const manifestValid: string = await runBrowser(["eval", `(async () => {
        const manifest = await fetch('./manifest.webmanifest').then((res) => res.json());
        return Boolean(manifest.name && manifest.start_url && manifest.display === 'standalone' && Array.isArray(manifest.icons) && manifest.icons.length > 0);
    })()`]);
    expect(manifestValid).toBe("true");

    // 3. Check service worker registration
    console.log("Step 3: Checking SW registration...");
    const swRegistered: string = await runBrowser(["eval", "Boolean(navigator.serviceWorker)"]);
    expect(swRegistered).toBe("true");

    // 4. Verify Preset Store is empty initially
    console.log("Step 4: Checking initial preset store empty...");
    const emptyCheck: string = await runBrowser(["eval", `(async () => {
        await window.__WEB_ARP_TEST__.clearPresets();
        const emptyPresets = await window.__WEB_ARP_TEST__.listPresets();
        return emptyPresets.length === 0;
    })()`]);
    expect(emptyCheck).toBe("true");

    // 5. Test saving preset to IndexedDB
    console.log("Step 5: Testing saving preset...");
    const saveCheck: string = await runBrowser(["eval", `(async () => {
        const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
        settings.baseNotes = ['C4', 'D4', 'F4'];
        const record = await window.__WEB_ARP_TEST__.savePreset(settings, { name: '__test__' });
        const records = await window.__WEB_ARP_TEST__.listPresets();
        return records.some((item) => item.id === record.id && item.name === '__test__');
    })()`]);
    expect(saveCheck).toBe("true");

    // 6. Test loading preset from IndexedDB
    console.log("Step 6: Testing loading preset...");
    const loadCheck: string = await runBrowser(["eval", `(async () => {
        const latest = (await window.__WEB_ARP_TEST__.listPresets())[0];
        await window.__WEB_ARP_TEST__.loadPreset(latest.id);
        const notes = document.getElementById('notes').value;
        return notes === 'C4 D4 F4';
    })()`]);
    expect(loadCheck).toBe("true");

    // 7. Test removing preset from IndexedDB
    console.log("Step 7: Testing preset deletion...");
    const deleteCheck: string = await runBrowser(["eval", `(async () => {
        const latest = (await window.__WEB_ARP_TEST__.listPresets())[0];
        await window.__WEB_ARP_TEST__.removePreset(latest.id);
        const afterDelete = await window.__WEB_ARP_TEST__.listPresets();
        return afterDelete.length === 0;
    })()`]);
    expect(deleteCheck).toBe("true");

    // 8. Test last session state serialization
    console.log("Step 8: Testing session serialization...");
    const sessionCheck: string = await runBrowser(["eval", `(async () => {
        const settings = window.__WEB_ARP_TEST__.getCurrentSettings();
        settings.baseNotes = ['E4', 'G4', 'B4'];
        await window.WebArpPresetStore.saveLastSession(settings);
        return true;
    })()`]);
    expect(sessionCheck).toBe("true");

    // 9. Reload page and check session restoration
    console.log("Step 9: Reloading and checking session restore...");
    await runBrowser(["reload"]);
    await runBrowser(["wait", "--fn", "window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"]);
    const sessionRestored: string = await runBrowser(["eval", "document.getElementById('notes').value === 'E4 G4 B4'"]);
    expect(sessionRestored).toBe("true");

    // 10. Test offline app shell rendering
    console.log("Step 10: Testing offline mode...");
    await runBrowser(["set", "offline", "on"]);
    await runBrowser(["reload"]);
    await runBrowser(["wait", "--fn", "document.getElementById('notes') !== null && window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"]);
    const offlineRendered: string = await runBrowser(["eval", "Boolean(document.getElementById('visualizer-plot') && document.getElementById('play-stop'))"]);
    expect(offlineRendered).toBe("true");

    // 11. Offline audio playback initialize & stop
    console.log("Step 11: Initializing audio offline...");
    await initializeAudio();
    await runBrowser(["click", "#play-stop"]);

    // 12. Disable offline and verify cache operations
    console.log("Step 12: Testing cache control hooks...");
    await runBrowser(["set", "offline", "off"]);
    const cacheResult: string = await runBrowser(["eval", `(async () => {
        const cachesBeforeClear = await window.WebArpPWA.listCaches();
        if (!cachesBeforeClear.some((c) => c.startsWith('web-arpeggiator-'))) {
            return 'missing-pre-cache';
        }
        const activation = await window.WebArpPWA.activateWaitingWorker();
        if (!activation.ok) {
            return 'activation-failed';
        }
        await window.WebArpPWA.clearCaches();
        const cachesAfterClear = await caches.keys();
        if (cachesAfterClear.some((c) => c.startsWith('web-arpeggiator-'))) {
            return 'clear-failed';
        }
        return 'success';
    })()`]);
    expect(cacheResult).toBe('"success"');
    console.log("PWA Shell Integration Suite complete!");
}, 30000);

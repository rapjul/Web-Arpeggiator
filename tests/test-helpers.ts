import { type Subprocess, spawn } from "bun";

/**
 * Array to track all spawned background subprocesses.
 * @type {Subprocess[]}
 */
const activeProcesses: Subprocess[] = [];

/**
 * Starts a local HTTP server serving the compiled 'dist' directory.
 * Assumes the build step has already run.
 *
 * @param {number} port - The port number for the test server to bind to.
 * @returns {Promise<Subprocess>} The spawned server subprocess.
 */
export async function startTestServer(port: number): Promise<Subprocess> {
    const serverProcess = spawn([
        "bunx",
        "vite",
        "preview",
        "--port",
        String(port),
        "--host",
        "127.0.0.1",
    ]);
    activeProcesses.push(serverProcess);

    // Allow the server process a brief moment to start listening
    await new Promise((resolve) => setTimeout(resolve, 1500));

    return serverProcess;
}

/**
 * Runs a command using the local `agent-browser` execution binary.
 *
 * @param {string[]} args - Command arguments to pass to the agent-browser binary.
 * @returns {Promise<string>} Trimmed standard output from the execution.
 */
export async function runBrowser(args: string[]): Promise<string> {
    const proc = spawn(["agent-browser", ...args]);
    activeProcesses.push(proc);

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    const idx = activeProcesses.indexOf(proc);
    if (idx !== -1) {
        activeProcesses.splice(idx, 1);
    }

    if (exitCode !== 0) {
        throw new Error(
            `agent-browser ${args.join(" ")} failed with exit code ${exitCode}. Output: ${output.trim()}`,
        );
    }

    return output.trim();
}

/**
 * Gracefully closes the agent-browser instance for the current test.
 *
 * @returns {Promise<void>}
 */
export async function closeBrowser(): Promise<void> {
    try {
        await runBrowser(["close"]);
    } catch {
        // Ignore if browser is already closed
    }
}

/**
 * Forcefully kills all currently active background processes spawned by the helpers.
 *
 * @returns {void}
 */
export function cleanupProcesses(): void {
    for (const proc of activeProcesses) {
        try {
            proc.kill();
        } catch {
            // Ignore if already dead
        }
    }
    activeProcesses.length = 0;
}

/**
 * Navigates to the test URL and waits for service worker registration/activation
 * and application rendering to complete.
 *
 * @param {string} url - The target application URL to open.
 * @returns {Promise<void>} Resolves when the PWA is initialized and ready.
 */
export async function waitForPwaReady(url: string): Promise<void> {
    const targetUrl = url.includes("?") ? `${url}&pwa=true` : `${url}?pwa=true`;

    console.log("  [PWA Ready] targetUrl =", targetUrl);
    console.log("  [PWA Ready] Opening targetUrl...");
    await runBrowser(["open", targetUrl]);

    console.log("  [PWA Ready] Waiting for load networkidle...");
    await runBrowser(["wait", "--load", "networkidle"]);

    // Wait for the browser's public Service Worker API to report registration.
    console.log("  [PWA Ready] Waiting for SW registration...");
    await runBrowser([
        "wait",
        "--fn",
        "navigator.serviceWorker?.getRegistration('./').then((registration) => registration !== undefined)",
    ]);

    console.log("  [PWA Ready] Waiting for SW controller not null...");
    await runBrowser(["wait", "--fn", "navigator.serviceWorker?.controller !== null"]);

    // Reload to activate the service worker controller and finish application startup.
    console.log("  [PWA Ready] Reloading page...");
    await runBrowser(["reload"]);

    console.log(
        "  [PWA Ready] Waiting for active controller and application shell after reload...",
    );
    await runBrowser([
        "wait",
        "--fn",
        "navigator.serviceWorker?.controller !== null && document.getElementById('notes') !== null",
    ]);
    console.log("  [PWA Ready] Done!");
}

/**
 * Simulates user gestures to bypass the browser audio autoplay policy,
 * lowers the master post-gain volume safely to prevent loud sounds,
 * and starts the Tone.js transport.
 *
 * @returns {Promise<void>}
 */
export async function initializeAudio(): Promise<void> {
    const overlayId: string = await runBrowser([
        "eval",
        `(() => {
            const qs = document.getElementById('quick-start-overlay');
            const simple = document.getElementById('start-overlay');
            if (qs && window.getComputedStyle(qs).display !== 'none') return 'quick-start-overlay';
            if (simple && window.getComputedStyle(simple).display !== 'none') return 'start-overlay';
            return 'none';
        })()`,
    ]);

    if (overlayId.includes("quick-start")) {
        await runBrowser(["click", "#quick-start-scratch"]);
    } else if (overlayId.includes("start-overlay")) {
        await runBrowser(["click", "#start-overlay"]);
    }

    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    // Set post gain to -12dB (70%) to keep audio output quiet during headless checks
    await runBrowser(["eval", "document.querySelector('#post-gain').value = -12"]);
    await runBrowser([
        "eval",
        "document.querySelector('#post-gain').dispatchEvent(new Event('input'))",
    ]);

    // Start playback
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);
}

/**
 * Exports the current application pattern as MIDI and returns its Note On pitches.
 *
 * This follows the same public download path a user uses, while allowing browser
 * tests to assert the materialized pattern without reaching into application state.
 *
 * @returns {Promise<number[]>} MIDI pitch numbers in exported playback order.
 */
export async function exportCurrentPatternMidiNotes(): Promise<number[]> {
    const result = await runBrowser([
        "eval",
        `(async () => {
            const midiButton = document.getElementById("offline-export-midi-button");
            if (!midiButton) throw new Error("Missing MIDI export button");

            let capturedBlob = null;
            const originalCreateObjectURL = URL.createObjectURL;
            const originalClick = HTMLAnchorElement.prototype.click;

            URL.createObjectURL = function (blob) {
                capturedBlob = blob;
                return originalCreateObjectURL.call(URL, blob);
            };
            HTMLAnchorElement.prototype.click = function () {};

            try {
                midiButton.click();
                await new Promise((resolve) => setTimeout(resolve, 50));
                if (!(capturedBlob instanceof Blob)) {
                    throw new Error("MIDI export did not create a Blob");
                }

                const bytes = new Uint8Array(await capturedBlob.arrayBuffer());
                const noteOns = [];

                // The app's MIDI encoder emits an explicit Note On status for
                // each note, so a direct scan avoids reimplementing a parser in
                // the browser harness while still observing the exported bytes.
                for (let index = 0; index <= bytes.length - 3; index += 1) {
                    if (bytes[index] === 0x90 && bytes[index + 2] > 0) {
                        noteOns.push(bytes[index + 1]);
                    }
                }

                return noteOns;
            } finally {
                URL.createObjectURL = originalCreateObjectURL;
                HTMLAnchorElement.prototype.click = originalClick;
            }
        })()`,
    ]);

    const parsed: unknown = JSON.parse(result);
    if (!Array.isArray(parsed) || !parsed.every((pitch) => typeof pitch === "number")) {
        throw new Error(`MIDI export returned an invalid note sequence: ${result}`);
    }
    return parsed.map((pitch) => Number(pitch));
}

/**
 * Waits until the application has completed its first browser-backed session save.
 *
 * @returns {Promise<void>} Resolves once the native IndexedDB session record exists.
 */
export async function waitForSessionAutosave(): Promise<void> {
    await runBrowser([
        "wait",
        "--fn",
        `new Promise((resolve, reject) => {
            const openRequest = indexedDB.open("web-arpeggiator-presets");
            openRequest.addEventListener("error", () => reject(openRequest.error));
            openRequest.addEventListener("success", () => {
                const database = openRequest.result;
                const transaction = database.transaction("lastSession", "readonly");
                const sessionRequest = transaction.objectStore("lastSession").get("current");
                sessionRequest.addEventListener("success", () => {
                    database.close();
                    resolve(Boolean(sessionRequest.result?.settings));
                });
                sessionRequest.addEventListener("error", () => {
                    database.close();
                    reject(sessionRequest.error);
                });
            });
        })`,
    ]);
}

/**
 * Deletes the preset and last session IndexedDB database and clears localStorage to ensure test isolation.
 *
 * @returns {Promise<void>}
 */
export async function resetBrowserState(): Promise<void> {
    await runBrowser([
        "eval",
        `
        new Promise((resolve, reject) => {
            try {
                localStorage.clear();
            } catch (_) {}
            const req = indexedDB.open('web-arpeggiator-presets');
            req.onsuccess = () => {
                const db = req.result;
                try {
                    // Open a transaction on both stores and clear them
                    const tx = db.transaction(['presetSnapshots', 'lastSession'], 'readwrite');
                    tx.objectStore('presetSnapshots').clear();
                    tx.objectStore('lastSession').clear();
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onerror = () => {
                        db.close();
                        reject(tx.error);
                    };
                } catch {
                    db.close();
                    // Database or stores might not exist yet on initial run, ignore
                    resolve();
                }
            };
            req.onerror = () => reject(req.error);
        })
    `,
    ]);

    // A restore started before the store was cleared can still resolve later and
    // overwrite test setup. Reloading after the clear starts restoration against
    // the empty store, so the next assertion begins from the default workspace.
    await runBrowser(["reload"]);
    await runBrowser(["wait", "--fn", "document.getElementById('notes')?.value === 'C4 E4 G4'"]);
}

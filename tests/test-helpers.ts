import { spawn, type Subprocess } from "bun";

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
        "127.0.0.1"
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
        throw new Error(`agent-browser ${args.join(" ")} failed with exit code ${exitCode}. Output: ${output.trim()}`);
    }

    return output.trim();
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
        } catch (e) {
            // Ignore if already dead
        }
    }
    activeProcesses.length = 0;
}

/**
 * Navigates to the test URL and waits for service worker registration/activation
 * and session state restoration to complete.
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

    // Wait for the app state to report service worker registration
    console.log("  [PWA Ready] Waiting for SW registration state...");
    await runBrowser(["wait", "--fn", "window.__WEB_ARP_PWA_STATE__?.serviceWorkerRegistered === true"]);

    console.log("  [PWA Ready] Waiting for SW controller not null...");
    await runBrowser(["wait", "--fn", "navigator.serviceWorker?.controller !== null"]);

    // Reload to activate the service worker controller and restore last session
    console.log("  [PWA Ready] Reloading page...");
    await runBrowser(["reload"]);

    console.log("  [PWA Ready] Waiting for active controller and session restore after reload...");
    await runBrowser([
        "wait",
        "--fn",
        "navigator.serviceWorker?.controller !== null && document.getElementById('notes') !== null && window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true"
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
    // Click overlay to trigger audio context resume
    await runBrowser(["click", "#start-overlay"]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    // Set post gain to -12dB (70%) to keep audio output quiet during headless checks
    await runBrowser(["eval", "document.querySelector('#post-gain').value = -12"]);
    await runBrowser(["eval", "document.querySelector('#post-gain').dispatchEvent(new Event('input'))"]);

    // Start playback
    await runBrowser(["click", "#play-stop"]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.textContent === 'Stop Audio'"]);
}

/**
 * Deletes the preset and last session IndexedDB database to ensure test isolation.
 *
 * @returns {Promise<void>}
 */
export async function resetBrowserState(): Promise<void> {
    await runBrowser(["eval", `
        new Promise((resolve, reject) => {
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
                } catch (e) {
                    db.close();
                    // Database or stores might not exist yet on initial run, ignore
                    resolve();
                }
            };
            req.onerror = () => reject(req.error);
        })
    `]);
}

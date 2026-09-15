import { expect, test as playwrightTest, type Page, type TestInfo } from "@playwright/test";

type BrowserCommand = readonly string[];
type BrowserTest = () => Promise<void> | void;

let activePage: Page | undefined;
let consoleMessages: string[] = [];

/**
 * Declares an isolated Playwright browser scenario. The runner is serial, but
 * Playwright still creates a fresh browser context for every test.
 */
export function test(title: string, body: BrowserTest): void {
    playwrightTest(title, async ({ page }, testInfo) => {
        activePage = page;
        consoleMessages = [];
        page.on("console", (message) => consoleMessages.push(message.text()));

        try {
            await body();
        } finally {
            activePage = undefined;
            await attachConsole(testInfo);
        }
    });
}

export { expect };
export const beforeAll = playwrightTest.beforeAll;
export const afterAll = playwrightTest.afterAll;

function requirePage(): Page {
    if (!activePage) throw new Error("Browser commands must run inside a Playwright test.");
    return activePage;
}

function normalizeAppUrl(url: string): string {
    if (url === "about:blank") return url;

    const target = new URL(url);
    if (target.hostname === "127.0.0.1" && target.pathname.endsWith("/index.html")) {
        target.port = "4173";
    }
    return target.toString();
}

async function attachConsole(testInfo: TestInfo): Promise<void> {
    if (consoleMessages.length > 0) {
        await testInfo.attach("browser-console", {
            body: consoleMessages.join("\n"),
            contentType: "text/plain",
        });
    }
}

/**
 * Temporary compatibility adapter for existing scenario steps. All commands
 * now execute through Playwright's public Page and Locator APIs, not a spawned
 * Agent Browser process.
 */
export async function runBrowser(args: BrowserCommand): Promise<string> {
    const [command, ...rest] = args;
    const page = requirePage();

    switch (command) {
        case "open":
            await page.goto(normalizeAppUrl(rest[0]), { waitUntil: "domcontentloaded" });
            return "";
        case "reload":
            await page.reload({ waitUntil: "domcontentloaded" });
            return "";
        case "click":
            await page
                .locator(rest[0].startsWith("[data-pattern=") ? `${rest[0]}:not(input)` : rest[0])
                .click();
            return "";
        case "select":
            await page.locator(rest[0]).selectOption(rest[1]);
            return "";
        case "scrollintoview":
            await page.locator(rest[0]).scrollIntoViewIfNeeded();
            return "";
        case "screenshot":
            await page.screenshot({ path: rest[0], fullPage: true });
            return "";
        case "console":
            if (rest[0] === "--clear") {
                consoleMessages = [];
                return "";
            }
            return consoleMessages.join("\n");
        case "eval": {
            const result = await page.evaluate(rest[0]);
            return JSON.stringify(result);
        }
        case "wait":
            if (rest[0] === "--load") {
                await page.waitForLoadState(rest[1] as "domcontentloaded" | "load" | "networkidle");
                return "";
            }
            if (rest[0] === "--fn") {
                await page.waitForFunction(rest[1]);
                return "";
            }
            break;
        case "set":
            if (rest[0] === "viewport") {
                await page.setViewportSize({ width: Number(rest[1]), height: Number(rest[2]) });
                return "";
            }
            if (rest[0] === "offline") {
                await page.context().setOffline(rest[1] === "on");
                return "";
            }
            break;
    }

    throw new Error(`Unsupported Playwright browser command: ${args.join(" ")}`);
}

/** @deprecated The preview server is managed by playwright.config.ts. */
export async function startTestServer(_port: number): Promise<void> {}
/** @deprecated Playwright owns the page lifecycle. */
export async function closeBrowser(): Promise<void> {}
/** @deprecated Playwright owns process cleanup. */
export function cleanupProcesses(): void {}

export async function waitForPwaReady(url: string): Promise<void> {
    const targetUrl = url.includes("?") ? `${url}&pwa=true` : `${url}?pwa=true`;
    await runBrowser(["open", targetUrl]);
    await runBrowser(["wait", "--load", "networkidle"]);
    await runBrowser([
        "wait",
        "--fn",
        "navigator.serviceWorker?.getRegistration('./').then((registration) => registration !== undefined)",
    ]);
    await runBrowser(["wait", "--fn", "navigator.serviceWorker?.controller !== null"]);
    await runBrowser(["reload"]);
    await runBrowser([
        "wait",
        "--fn",
        "navigator.serviceWorker?.controller !== null && document.getElementById('notes') !== null",
    ]);
}

export async function initializeAudio(): Promise<void> {
    const overlayId = await runBrowser([
        "eval",
        `(() => {
            const quickStart = document.getElementById("quick-start-overlay");
            const start = document.getElementById("start-overlay");
            if (quickStart && window.getComputedStyle(quickStart).display !== "none") return "quick-start-overlay";
            if (start && window.getComputedStyle(start).display !== "none") return "start-overlay";
            return "none";
        })()`,
    ]);
    if (overlayId.includes("quick-start")) await runBrowser(["click", "#quick-start-scratch"]);
    else if (overlayId.includes("start-overlay")) await runBrowser(["click", "#start-overlay"]);

    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);
    await runBrowser(["eval", "document.querySelector('#post-gain').value = -12"]);
    await runBrowser([
        "eval",
        "document.querySelector('#post-gain').dispatchEvent(new Event('input'))",
    ]);
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);
}

export async function exportCurrentPatternMidiNotes(): Promise<number[]> {
    const result = await runBrowser([
        "eval",
        `(async () => {
            const button = document.getElementById("offline-export-midi-button");
            if (!button) throw new Error("Missing MIDI export button");
            const original = URL.createObjectURL;
            let blob = null;
            URL.createObjectURL = (value) => { blob = value; return original.call(URL, value); };
            try {
                button.click();
                await new Promise((resolve) => setTimeout(resolve, 50));
                if (!(blob instanceof Blob)) throw new Error("MIDI export did not create a Blob");
                const bytes = new Uint8Array(await blob.arrayBuffer());
                const notes = [];
                for (let i = 0; i <= bytes.length - 3; i += 1) {
                    if (bytes[i] === 0x90 && bytes[i + 2] > 0) notes.push(bytes[i + 1]);
                }
                return notes;
            } finally { URL.createObjectURL = original; }
        })()`,
    ]);
    const parsed: unknown = JSON.parse(result);
    if (!Array.isArray(parsed) || !parsed.every((note) => typeof note === "number")) {
        throw new Error(`MIDI export returned an invalid note sequence: ${result}`);
    }
    return parsed.map(Number);
}

export async function waitForSessionAutosave(): Promise<void> {
    await runBrowser([
        "wait",
        "--fn",
        `new Promise((resolve, reject) => {
            const request = indexedDB.open("web-arpeggiator-presets");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const database = request.result;
                const transaction = database.transaction("lastSession", "readonly");
                const session = transaction.objectStore("lastSession").get("current");
                session.onsuccess = () => { database.close(); resolve(Boolean(session.result?.settings)); };
                session.onerror = () => { database.close(); reject(session.error); };
            };
        })`,
    ]);
}

export async function resetBrowserState(): Promise<void> {
    await runBrowser([
        "eval",
        `new Promise((resolve, reject) => {
            localStorage.clear();
            const request = indexedDB.open("web-arpeggiator-presets");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const database = request.result;
                try {
                    const transaction = database.transaction(["presetSnapshots", "lastSession"], "readwrite");
                    transaction.objectStore("presetSnapshots").clear();
                    transaction.objectStore("lastSession").clear();
                    transaction.oncomplete = () => { database.close(); resolve(); };
                    transaction.onerror = () => { database.close(); reject(transaction.error); };
                } catch { database.close(); resolve(); }
            };
        })`,
    ]);
    await runBrowser(["reload"]);
    await runBrowser(["wait", "--fn", "document.getElementById('notes')?.value === 'C4 E4 G4'"]);
}

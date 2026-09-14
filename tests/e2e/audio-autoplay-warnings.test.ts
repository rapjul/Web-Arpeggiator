import { afterAll, beforeAll, expect, test } from "bun:test";
import { cleanupProcesses, closeBrowser, runBrowser, startTestServer } from "../test-helpers";

const PORT = 4191;
const APP_URL = `http://127.0.0.1:${PORT}/index.html`;
const AUTOPLAY_WARNING = /AudioContext (was not allowed to start|is "suspended")/i;

beforeAll(async (): Promise<void> => {
    await startTestServer(PORT);
});

afterAll(async (): Promise<void> => {
    await closeBrowser();
    cleanupProcesses();
});

test("defers the Tone runtime until the explicit Start Audio action", async (): Promise<void> => {
    await runBrowser(["open", "about:blank"]);
    await runBrowser(["console", "--clear"]);
    await runBrowser(["open", APP_URL]);
    await runBrowser(["wait", "--load", "networkidle"]);
    await runBrowser(["wait", "--fn", "document.getElementById('notes') !== null"]);

    const preActivationConsole = await runBrowser(["console"]);
    expect(preActivationConsole).not.toMatch(AUTOPLAY_WARNING);

    const bridgeState = await runBrowser([
        "eval",
        `JSON.stringify({
            audioEngine: "audioEngine" in window,
            presetStore: "WebArpPresetStore" in window,
            pwaController: "WebArpPWA" in window,
            pwaState: "__WEB_ARP_PWA_STATE__" in window,
            startAudio: "startAudio" in window,
            filterNoteInput: "filterNoteInput" in window,
            filterNumericInput: "filterNumericInput" in window,
            notesInlineHandler: document.getElementById("notes")?.hasAttribute("onkeydown"),
            loopCountInlineHandler: document.getElementById("loop-count")?.hasAttribute("onkeydown"),
        })`,
    ]);
    expect(JSON.parse(JSON.parse(bridgeState))).toEqual({
        audioEngine: false,
        presetStore: false,
        pwaController: false,
        pwaState: false,
        startAudio: false,
        filterNoteInput: false,
        filterNumericInput: false,
        notesInlineHandler: false,
        loopCountInlineHandler: false,
    });

    const overlayId = await runBrowser([
        "eval",
        `(() => {
            const quickStart = document.getElementById('quick-start-overlay');
            return quickStart && getComputedStyle(quickStart).display !== 'none'
                ? 'quick-start-scratch'
                : 'start-overlay';
        })()`,
    ]);
    await runBrowser(["click", `#${JSON.parse(overlayId)}`]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);
});

test("applies a preset restored before activation after starting audio", async (): Promise<void> => {
    await runBrowser(["open", "about:blank"]);
    await runBrowser([
        "open",
        `${APP_URL}?bpm=155&synth=fmSynth&wave=sawtooth&cutoff=3700&delay=0.37&reverb=0.42`,
    ]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('synth-type')?.value === 'fmSynth' && document.getElementById('bpm')?.value === '155'",
    ]);

    const restoredBeforeActivation = await runBrowser([
        "eval",
        "document.getElementById('filter-cutoff')?.value",
    ]);
    expect(JSON.parse(restoredBeforeActivation)).toBe("3700");

    await runBrowser(["click", "#start-overlay"]);
    await runBrowser(["wait", "--fn", "document.getElementById('play-stop')?.disabled === false"]);

    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);
});

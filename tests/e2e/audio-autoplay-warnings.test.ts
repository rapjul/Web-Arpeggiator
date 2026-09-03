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
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('notes') !== null && window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true",
    ]);

    const preActivationConsole = await runBrowser(["console"]);
    expect(preActivationConsole).not.toMatch(AUTOPLAY_WARNING);

    const preActivationState = await runBrowser([
        "eval",
        "JSON.stringify({ ...window.__WEB_ARP_TEST__?.getAudioRuntimeState(), hasTone: Boolean(window.__WEB_ARP_TEST__?.Tone) })",
    ]);
    expect(JSON.parse(JSON.parse(preActivationState))).toEqual({
        hasEngine: false,
        isAudioContextStarted: false,
        hasTone: false,
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
    await runBrowser([
        "wait",
        "--fn",
        "window.audioEngine && window.__WEB_ARP_TEST__?.Tone?.getContext()?.state === 'running'",
    ]);

    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Stop Audio'",
    ]);
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('play-stop')?.textContent === 'Restart Audio'",
    ]);

    await runBrowser(["eval", "window.__WEB_ARP_TEST__?.Tone?.getContext().rawContext.suspend()"]);
    await runBrowser([
        "wait",
        "--fn",
        "window.__WEB_ARP_TEST__?.Tone?.getContext()?.state === 'suspended'",
    ]);
    await runBrowser(["click", "#play-stop"]);
    await runBrowser([
        "wait",
        "--fn",
        "window.__WEB_ARP_TEST__?.Tone?.getContext()?.state === 'running'",
    ]);
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
        "JSON.stringify({ state: window.__WEB_ARP_TEST__?.getAudioRuntimeState(), cutoff: document.getElementById('filter-cutoff')?.value })",
    ]);
    expect(JSON.parse(JSON.parse(restoredBeforeActivation))).toEqual({
        state: { hasEngine: false, isAudioContextStarted: false },
        cutoff: "3700",
    });

    await runBrowser(["click", "#start-overlay"]);
    await runBrowser([
        "wait",
        "--fn",
        `(() => {
            const engine = window.audioEngine;
            return engine?.activeSynth === engine?.synths.fmSynth
                && engine.filter.frequency.value === 3700
                && engine.delay.wet.value === 0.37
                && engine.reverb.wet.value === 0.42;
        })()`,
    ]);
});

test("shares one activation request across overlapping explicit starts", async (): Promise<void> => {
    await runBrowser(["open", "about:blank"]);
    await runBrowser(["open", APP_URL]);
    await runBrowser([
        "wait",
        "--fn",
        "document.getElementById('notes') !== null && window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true",
    ]);
    const overlayId = await runBrowser([
        "eval",
        `(() => {
            const quickStart = document.getElementById('quick-start-overlay');
            return quickStart && getComputedStyle(quickStart).display !== 'none'
                ? 'quick-start-scratch'
                : 'start-overlay';
        })()`,
    ]);
    await runBrowser([
        "eval",
        `(() => {
            const trigger = document.getElementById(${overlayId});
            trigger?.addEventListener(
                'click',
                () => {
                    Promise.all([window.startAudio(), window.startAudio()]).then(() => {
                        window.__audioStartResults = 'ready';
                    });
                },
                { once: true },
            );
        })()`,
    ]);

    await runBrowser(["click", `#${JSON.parse(overlayId)}`]);
    await runBrowser([
        "wait",
        "--fn",
        "window.__audioStartResults === 'ready' && window.__WEB_ARP_TEST__?.getAudioRuntimeState()?.isAudioContextStarted === true",
    ]);

    const activationState = await runBrowser([
        "eval",
        "JSON.stringify({ engine: Boolean(window.audioEngine), context: window.__WEB_ARP_TEST__?.Tone?.getContext()?.state })",
    ]);
    expect(JSON.parse(JSON.parse(activationState))).toEqual({
        engine: true,
        context: "running",
    });
});

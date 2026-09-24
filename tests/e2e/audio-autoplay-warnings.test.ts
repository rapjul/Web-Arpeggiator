import { dismissOnboarding, expect, test } from "./fixtures/app";

const AUTOPLAY_WARNING = /AudioContext (was not allowed to start|is "suspended")/i;

test("defers audio initialization until the explicit Start Audio action", async ({ page }) => {
    const consoleMessages: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));

    await page.goto("/index.html?pwa=true", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#notes")).toBeVisible();
    expect(consoleMessages.join("\n")).not.toMatch(AUTOPLAY_WARNING);

    const publicTestBridge = await page.evaluate(() => ({
        audioEngine: "audioEngine" in window,
        presetStore: "WebArpPresetStore" in window,
        pwaController: "WebArpPWA" in window,
        pwaState: "__WEB_ARP_PWA_STATE__" in window,
        startAudio: "startAudio" in window,
        filterNoteInput: "filterNoteInput" in window,
        filterNumericInput: "filterNumericInput" in window,
        notesInlineHandler: document.getElementById("notes")?.hasAttribute("onkeydown"),
        loopCountInlineHandler: document.getElementById("loop-count")?.hasAttribute("onkeydown"),
    }));
    expect(publicTestBridge).toEqual({
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

    await dismissOnboarding(page);
    await page.locator("#play-stop").click();
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
});

test("applies URL preset controls before and after audio activation", async ({ page }) => {
    await page.goto(
        "/index.html?pwa=true&bpm=155&synth=fmSynth&wave=sawtooth&cutoff=3700&delay=0.37&reverb=0.42",
        { waitUntil: "domcontentloaded" },
    );

    await expect(page.locator("#synth-type")).toHaveValue("fmSynth");
    await expect(page.locator("#bpm")).toHaveValue("155");
    await expect(page.locator("#filter-cutoff")).toHaveValue("3700");

    await dismissOnboarding(page);
    await expect(page.locator("#play-stop")).toHaveText("Stop Audio");
    await expect(page.locator("#synth-type")).toHaveValue("fmSynth");
    await expect(page.locator("#bpm")).toHaveValue("155");
    await expect(page.locator("#filter-cutoff")).toHaveValue("3700");
});

import {
    downloadCurrentPatternMidi,
    expect,
    extractMidiNoteOns,
    dismissOnboarding,
    readPersistedSession,
    startAudio,
    test,
} from "./fixtures/app";

const chordCases = [
    { root: "C", chord: "major", notes: "C4 E4 G4" },
    { root: "A", chord: "minor", notes: "A4 C5 E5" },
    { root: "G", chord: "dom7", notes: "G4 B4 D5 F5" },
    { root: "D", chord: "pentatonic", notes: "D4 E4 F#4 A4 B4" },
] as const;

test("builds each public chord-starter note set for the selected root", async ({
    pwaPage: page,
}) => {
    await startAudio(page);
    await expect(page.locator("#chord-buttons .chord-btn")).toHaveCount(6);
    await page.locator("#scale-quantize-toggle").uncheck();

    for (const chordCase of chordCases) {
        await page.locator("#scale-root").selectOption(chordCase.root);
        await page.locator(`.chord-btn[data-chord='${chordCase.chord}']`).click();
        await expect(page.locator("#notes")).toHaveValue(chordCase.notes);
    }
});

test("exports the adapted chord notes in the MIDI download", async ({ pwaPage: page }) => {
    await startAudio(page);

    await page.locator("input[name='octave-range'][value='1']").check({ force: true });
    await page.locator("#scale-root").selectOption("C");
    await page.locator("#scale-type").selectOption("minor");
    await page.locator("#scale-quantize-toggle").check();
    await page.locator("#loop-count").fill("1");
    await page.locator(".chord-btn[data-chord='major']").click();
    await expect(page.locator("#chord-conflict-overlay")).toBeVisible();
    await page.locator("#chord-conflict-adapt").click();

    await expect(page.locator("#notes")).toHaveValue("C4 D#4 G4");
    const download = await downloadCurrentPatternMidi(page);
    expect(extractMidiNoteOns(download.bytes)).toEqual([60, 63, 67]);
});

test("isolates, applies, and persists chord conflict choices", async ({ pwaPage: page }) => {
    await startAudio(page);

    const overlay = page.locator("#chord-conflict-overlay");
    const appMain = page.locator("#app-main");
    const minorChord = page.locator(".chord-btn[data-chord='minor']");
    const notes = page.locator("#notes");
    const quantizeToggle = page.locator("#scale-quantize-toggle");
    const scaleType = page.locator("#scale-type");
    const c4Key = page.locator(".piano-key[data-note='C4']");

    await page.locator("#keyboard-details > summary").click();
    await page.locator("#keyboard-toggle").check();
    await page.locator("#scale-root").selectOption("C");
    await scaleType.selectOption("major");
    await quantizeToggle.check();

    await minorChord.click();
    await expect(overlay).toBeVisible();
    await expect(appMain).toHaveAttribute("inert", "");
    await expect(page.locator("#chord-conflict-dialog")).toHaveAttribute(
        "aria-describedby",
        "chord-conflict-description",
    );
    await expect(page.locator("#chord-conflict-description")).toContainText(
        "Keep preserves the requested chord and turns scale snapping off",
    );
    await expect(page.locator("#scale-root-help")).toContainText(
        "scale snapping and chord starters",
    );
    await expect(page.locator("#chord-conflict-adapt")).toBeFocused();
    await page.keyboard.down("z");
    await expect(c4Key).not.toHaveClass(/active/);
    await page.keyboard.up("z");
    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    await expect(appMain).not.toHaveAttribute("inert", "");
    await expect(notes).toHaveValue("C4 E4 G4");
    await expect(minorChord).toBeFocused();

    await minorChord.click();
    await page.locator("#chord-conflict-adapt").click();
    await expect(notes).toHaveValue("C4 D4 G4");
    await expect(quantizeToggle).toBeChecked();

    await minorChord.click();
    await page.locator("#chord-conflict-keep").click();
    await expect(notes).toHaveValue("C4 D#4 G4");
    await expect(quantizeToggle).not.toBeChecked();
    await expect(scaleType).toHaveValue("major");
    await expect
        .poll(() => readPersistedSession(page))
        .toMatchObject({
            baseNotes: ["C4", "D#4", "G4"],
            scaleQuantize: false,
            scaleType: "major",
        });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#notes")).toHaveValue("C4 D#4 G4");
    await expect(page.locator("#scale-quantize-toggle")).not.toBeChecked();
    await expect(page.locator("#scale-type")).toHaveValue("major");
    await dismissOnboarding(page);
    await page.locator("#scale-quantize-toggle").check();
    await expect(page.locator("#scale-type")).toHaveValue("major");
});

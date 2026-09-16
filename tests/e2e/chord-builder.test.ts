import {
    downloadCurrentPatternMidi,
    expect,
    extractMidiNoteOns,
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

    for (const chordCase of chordCases) {
        await page.locator("#scale-root").selectOption(chordCase.root);
        await page.locator(`.chord-btn[data-chord='${chordCase.chord}']`).click();
        await expect(page.locator("#notes")).toHaveValue(chordCase.notes);
    }
});

test("exports scale-quantized chord notes in the MIDI download", async ({ pwaPage: page }) => {
    await startAudio(page);

    await page.locator("input[name='octave-range'][value='1']").check({ force: true });
    await page.locator("#scale-root").selectOption("C");
    await page.locator("#scale-type").selectOption("minor");
    await page.locator("#scale-quantize-toggle").check();
    await page.locator("#loop-count").fill("1");
    await page.locator(".chord-btn[data-chord='major']").click();

    await expect(page.locator("#notes")).toHaveValue("C4 E4 G4");
    const download = await downloadCurrentPatternMidi(page);
    expect(extractMidiNoteOns(download.bytes)).toEqual([60, 63, 67]);
});

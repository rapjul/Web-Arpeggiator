import { expect, startAudio, test } from "./fixtures/app";

function splitNotes(notes: string): string[] {
    return notes.trim().split(/\s+/).filter(Boolean);
}

test("generates four to six playable notes without scale quantization", async ({
    pwaPage: page,
}) => {
    await startAudio(page);

    await page.locator("#scale-quantize-toggle").uncheck();
    await page.locator("#randomize-notes").click();

    const notes = splitNotes(await page.locator("#notes").inputValue());
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(notes.length).toBeLessThanOrEqual(6);
    expect(notes.every((note) => /^[A-G][#b]?[3-5]$/.test(note))).toBe(true);
});

test("generates notes from the selected quantized scale", async ({ pwaPage: page }) => {
    await startAudio(page);

    await page.locator("#scale-root").selectOption("F");
    await page.locator("#scale-type").selectOption("minor");
    await page.locator("#scale-quantize-toggle").check();
    await page.locator("#randomize-notes").click();

    const fMinorPitches = new Set(["F", "G", "Ab", "G#", "Bb", "A#", "C", "Db", "C#", "Eb", "D#"]);
    const notes = splitNotes(await page.locator("#notes").inputValue());
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((note) => fMinorPitches.has(note.slice(0, -1)))).toBe(true);
});

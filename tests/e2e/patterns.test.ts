import { ALLOWED_DIRECTIONS } from "@core/url-preset.js";
import {
    downloadCurrentPatternMidi,
    expect,
    extractMidiNoteOns,
    startAudio,
    test,
    type Page,
} from "./fixtures/app";

const deterministicMidiSequences: Readonly<Record<string, readonly number[]>> = {
    up: [60, 64, 67],
    down: [67, 64, 60],
    upDown: [60, 64, 67, 64],
    downUp: [67, 64, 60, 64],
    upDownRepeat: [60, 64, 67, 67, 64, 60],
    downUpRepeat: [67, 64, 60, 60, 64, 67],
    octaveCycle: [60, 72, 84, 60, 72, 84, 64, 76, 88, 64, 76, 88, 67, 79, 91, 67, 79, 91],
    octaveCycleReverse: [91, 79, 67, 91, 79, 67, 88, 76, 64, 88, 76, 64, 84, 72, 60, 84, 72, 60],
    octaveCyclePingPong: [
        60, 72, 84, 72, 60, 72, 84, 64, 76, 88, 76, 64, 76, 88, 67, 79, 91, 79, 67, 79, 91,
    ],
};

const randomizedPatternLengths: Readonly<Record<string, number>> = {
    random: 3,
    randomCycle: 3,
    randomWalk: 3,
    randomWalkDrunk: 16,
};

async function configurePattern(page: Page): Promise<void> {
    await startAudio(page);
    await page.locator("#notes").fill("C4 E4 G4");
    await page.locator("#notes").dispatchEvent("change");
    await page.locator("#scale-quantize-toggle").uncheck();
    await page.locator("input[name='octave-range'][value='1']").check({ force: true });
    await page.locator("#loop-count").fill("1");
}

async function selectDirection(page: Page, direction: string): Promise<void> {
    const input = page.locator(`input[name='pattern-direction'][value='${direction}']`);
    await input.check({ force: true });
    await expect(input).toBeChecked();
    await expect(page.locator("#note-step-indicator > *")).not.toHaveCount(0);
}

test("exports the documented sequence for every deterministic pattern direction", async ({
    pwaPage: page,
}) => {
    await configurePattern(page);

    for (const [direction, expectedNotes] of Object.entries(deterministicMidiSequences)) {
        await selectDirection(page, direction);
        const download = await downloadCurrentPatternMidi(page);
        expect(extractMidiNoteOns(download.bytes)).toEqual(expectedNotes);
    }
});

test("exports valid source notes for every non-deterministic pattern direction", async ({
    pwaPage: page,
}) => {
    await configurePattern(page);

    const randomizedDirections = ALLOWED_DIRECTIONS.filter(
        (direction) => direction in randomizedPatternLengths,
    );
    for (const direction of randomizedDirections) {
        await selectDirection(page, direction);
        const download = await downloadCurrentPatternMidi(page);
        const notes = extractMidiNoteOns(download.bytes);
        expect(notes).toHaveLength(randomizedPatternLengths[direction]);
        expect(notes.every((note) => [60, 64, 67].includes(note))).toBe(true);
    }
});

import { dismissOnboarding, expect, startAudio, test } from "./fixtures/app";

const sliderGuidance = [
    ["post-gain", "Master output volume"],
    ["bpm", "Tempo speed"],
    ["swing", "Adds groove"],
    ["interval", "Rhythmic step subdivision"],
    ["env-attack", "Time to reach peak volume"],
    ["env-decay", "Time to drop from peak"],
    ["env-sustain", "Held volume level"],
    ["env-release", "Fade-out duration"],
    ["filter-cutoff", "Tone brightness"],
    ["filter-resonance", "Sharpness"],
    ["drive-mix", "Harmonic saturation"],
    ["chorus-mix", "Stereo shimmer"],
    ["autopan-mix", "Left/right stereo"],
    ["delay-mix", "Echo wet/dry"],
    ["reverb-mix", "Room acoustic space"],
    ["duty-cycle", "Pulse width"],
    ["harmonicity", "Frequency ratio"],
    ["modulation-index", "Intensity / depth"],
    ["mono-cutoff", "Starting cutoff frequency"],
    ["mono-octaves", "Number of octaves modulated"],
    ["mono-q", "Resonance sharpness"],
    ["duo-harm", "Harmonic interval ratio"],
    ["duo-vibrato", "Pitch modulation vibrato"],
    ["pluck-dampening", "String material dampening"],
    ["pluck-resonance", "String resonance sustain"],
    ["pluck-noise", "Initial plectrum pick/pluck"],
    ["membrane-pitch-decay", "Duration of initial pitch drop"],
    ["membrane-octaves", "Pitch sweep range"],
    ["gate", "staccato & punchy"],
    ["loop-count", "complete pattern cycles"],
] as const;

const patternTooltips = [
    ["up", "Ascending order"],
    ["down", "Descending order"],
    ["upDown", "Ascending then descending"],
    ["downUp", "Descending then ascending"],
    ["upDownRepeat", "repeating apex"],
    ["downUpRepeat", "repeating apex"],
    ["random", "Random note selection"],
    ["randomCycle", "Randomize every note once"],
    ["octaveCycle", "across 3 ascending octaves, repeated twice"],
    ["octaveCycleReverse", "across 3 descending octaves, repeated twice"],
    ["octaveCyclePingPong", "alternating ascending and descending"],
    ["randomWalk", "adjacent notes"],
    ["randomWalkDrunk", "occasional unexpected leaps"],
] as const;

test("provides guidance for every parameter and pattern direction", async ({ pwaPage: page }) => {
    for (const [id, guidance] of sliderGuidance) {
        const description = await page.locator(`#${id}`).evaluate((control) => {
            const parent = control.closest("div");
            return (
                parent?.querySelector("p")?.textContent ||
                parent?.parentElement?.querySelector("p")?.textContent ||
                ""
            );
        });
        expect(description).toContain(guidance);
    }

    for (const [pattern, guidance] of patternTooltips) {
        const radio = page.locator(`input[data-pattern='${pattern}']`);
        const button = page.locator(`.pattern-btn[data-pattern='${pattern}']`);
        await expect(radio).toHaveAttribute("aria-label", new RegExp(guidance, "i"));
        await expect(button).toHaveAttribute("data-tooltip", new RegExp(guidance, "i"));
    }

    await expect(page.locator("#octave-shift-buttons").locator("..")).toContainText(
        "Transposition offset",
    );
    await expect(page.locator("#octave-range-buttons").locator("..")).toContainText(
        "Number of octave duplications",
    );
});

test("updates the offline export duration estimate from public pattern controls", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);
    await startAudio(page);

    const notes = page.locator("#notes");
    const bpm = page.locator("#bpm");
    const loopCount = page.locator("#loop-count");
    const duration = page.locator("#offline-export-duration");
    const selectRadio = async (selector: string): Promise<void> => {
        await page.locator(selector).locator("xpath=..").click();
    };

    await notes.fill("C4 E4 G4");
    await notes.dispatchEvent("change");
    await selectRadio("input[name='octave-range'][value='1']");
    await page.locator("#interval").selectOption("16n");
    await bpm.fill("60");
    await loopCount.fill("3");
    await expect(duration).toHaveText(
        "3 Pattern cycles at ~0.75s each + 2.0s effects tail. Export duration: ~4.3 seconds",
    );

    await notes.fill("C4 E4 G4 B4");
    await expect(duration).toHaveText(
        "3 Pattern cycles at ~1.00s each + 2.0s effects tail. Export duration: ~5.0 seconds",
    );

    await notes.fill("C4 E4 G4");
    await notes.dispatchEvent("change");
    await expect(duration).toHaveText(
        "3 Pattern cycles at ~0.75s each + 2.0s effects tail. Export duration: ~4.3 seconds",
    );
    await selectRadio("input[name='octave-range'][value='2']");
    await expect(duration).toHaveText(
        "3 Pattern cycles at ~1.50s each + 2.0s effects tail. Export duration: ~6.5 seconds",
    );
    await selectRadio("input[name='pattern-direction'][value='upDown']");
    await expect(duration).toHaveText(
        "3 Pattern cycles at ~2.50s each + 2.0s effects tail. Export duration: ~9.5 seconds",
    );
    await bpm.fill("120");
    await expect(duration).toHaveText(
        "3 Pattern cycles at ~1.25s each + 2.0s effects tail. Export duration: ~5.8 seconds",
    );
    await loopCount.fill("1");
    await expect(duration).toHaveText(
        "1 Pattern cycle at ~1.25s each + 2.0s effects tail. Export duration: ~3.3 seconds",
    );

    await page.locator("#interval").selectOption("8n");
    await expect(duration).toHaveText(
        "1 Pattern cycle at ~2.50s each + 2.0s effects tail. Export duration: ~4.5 seconds",
    );

    await loopCount.fill("-1");
    await loopCount.dispatchEvent("change");
    await expect(loopCount).toHaveValue("1");
    await loopCount.fill("101");
    await loopCount.dispatchEvent("change");
    await expect(loopCount).toHaveValue("100");
});

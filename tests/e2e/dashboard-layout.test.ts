import { expect, test } from "./fixtures/app";

test("orders dashboard sections for the creative workflow", async ({ pwaPage: page }) => {
    const sectionHeadings = await page
        .locator("main#app-main > section, main#app-main > div")
        .evaluateAll((sections) =>
            sections.map(
                (section) => section.querySelector("h2")?.textContent?.trim() || section.id,
            ),
        );

    const requiredSections = [
        "Sound Starters",
        "Transport",
        "Pattern",
        "Scale Quantization",
        "Octave",
        "Keyboard",
        "Synth",
        "Envelope",
        "Filter",
        "Effects",
    ];
    for (const section of requiredSections) {
        expect(sectionHeadings.some((heading) => heading.includes(section))).toBe(true);
    }

    const indexOf = (section: string): number =>
        sectionHeadings.findIndex((heading) => heading.includes(section));
    const workflow = [
        "Sound Starters",
        "Transport",
        "Pattern",
        "Scale Quantization",
        "Octave",
        "Keyboard",
        "Synth",
        "Envelope",
        "Filter",
        "Effects",
    ];
    for (let index = 1; index < workflow.length; index += 1) {
        expect(indexOf(workflow[index - 1])).toBeLessThan(indexOf(workflow[index]));
    }
});

/**
 * Viewports to validate across mobile, tablet, and desktop breakpoints.
 */
const RESPONSIVE_VIEWPORT_WIDTHS = [320, 375, 390, 430, 820, 1280] as const;

test("maintains responsive layout, bounded controls, and balanced wrapping across all viewport breakpoints", async ({
    pwaPage: page,
}) => {
    // Dismiss start overlay if present to reveal full dashboard
    const startButton = page.locator("#start-audio-btn");
    if (await startButton.isVisible()) {
        await startButton.click();
    }

    for (const width of RESPONSIVE_VIEWPORT_WIDTHS) {
        await page.setViewportSize({ width, height: 850 });
        // Allow container queries and layout to settle
        await page.waitForTimeout(50);

        // 1. Zero horizontal page overflow
        const hasHorizontalScroll = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(
            hasHorizontalScroll,
            `Unexpected horizontal page scroll detected at ${width}px viewport`,
        ).toBe(false);

        // 2. Offline export tail control has zero overflow/clipping
        const tailOverflow = await page
            .locator("#offline-export-tail-control")
            .evaluate((el) => el.scrollWidth > el.clientWidth);
        expect(
            tailOverflow,
            `Offline export tail control clipped or overflowing at ${width}px viewport`,
        ).toBe(false);

        // 3. Wide controls (sliders, VU meter, notes input) capped at ergonomic 480px width
        const bpmSliderWidth = await page
            .locator("#bpm")
            .evaluate((el) => el.getBoundingClientRect().width);
        expect(bpmSliderWidth).toBeLessThanOrEqual(481);

        const vuMeterWidth = await page
            .locator("#vu-meter-container")
            .evaluate((el) => el.getBoundingClientRect().width);
        expect(vuMeterWidth).toBeLessThanOrEqual(481);

        const notesWidth = await page
            .locator("#notes")
            .evaluate((el) => el.getBoundingClientRect().width);
        expect(notesWidth).toBeLessThanOrEqual(481);

        // 4. Octave shift buttons layout: single row when container >= 280px, balanced 3-1-3 rows when < 280px
        const octaveDetails = await page
            .locator("#octave-shift-buttons .octave-btn")
            .evaluateAll((btns) => {
                const parent = btns[0].closest("#octave-shift-buttons");
                const parentWidth = parent?.getBoundingClientRect().width ?? 0;
                const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
                const countsByTop = new Map<number, number>();
                for (const top of tops) {
                    countsByTop.set(top, (countsByTop.get(top) ?? 0) + 1);
                }
                return {
                    parentWidth,
                    uniqueRows: countsByTop.size,
                    rowCounts: Array.from(countsByTop.values()),
                };
            });

        if (octaveDetails.parentWidth >= 280) {
            expect(
                octaveDetails.uniqueRows,
                `Octave shift buttons should fit on a single row at ${width}px viewport (container width: ${octaveDetails.parentWidth}px)`,
            ).toBe(1);
        } else {
            expect(
                octaveDetails.uniqueRows,
                `Octave shift buttons should wrap into balanced 3 rows at ${width}px viewport (container width: ${octaveDetails.parentWidth}px)`,
            ).toBe(3);
            expect(
                octaveDetails.rowCounts,
                `Octave shift buttons should follow 3-1-3 musical layout at ${width}px viewport`,
            ).toEqual([3, 1, 3]);
        }

        // 5. Waveform pulse button width remains bounded (no full-width blowout)
        const pulseWidth = await page
            .locator("button[data-wave='pulse']")
            .evaluate((el) => el.getBoundingClientRect().width);
        expect(
            pulseWidth,
            `Waveform pulse button width should not exceed 145px at ${width}px viewport`,
        ).toBeLessThanOrEqual(145);

        // 6. Pattern direction buttons maintain ergonomic touch target height and padding
        const firstPatternBtn = page.locator("#pattern-buttons .pattern-btn").first();
        const patternBtnBox = await firstPatternBtn.boundingBox();
        expect(patternBtnBox).not.toBeNull();
        expect(
            patternBtnBox?.height,
            `Pattern button height should be at least 36px at ${width}px viewport`,
        ).toBeGreaterThanOrEqual(36);
    }

    // 7. Typography text-wrap rules: balance for headings, labels, and summaries
    const headingWrap = await page
        .locator("h2")
        .first()
        .evaluate((el) => getComputedStyle(el).textWrap);
    expect(headingWrap).toBe("balance");

    const labelWrap = await page
        .locator("label")
        .first()
        .evaluate((el) => getComputedStyle(el).textWrap);
    expect(labelWrap).toBe("balance");

    const summaryWrap = await page
        .locator("summary")
        .first()
        .evaluate((el) => getComputedStyle(el).textWrap);
    expect(summaryWrap).toBe("balance");

    const tailHelpWrap = await page
        .locator("#offline-export-tail-control > p")
        .first()
        .evaluate((el) => getComputedStyle(el).textWrap);
    expect(tailHelpWrap).toBe("balance");
});

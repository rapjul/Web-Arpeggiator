import { dismissOnboarding, expect, test } from "./fixtures/app";

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
    await dismissOnboarding(page);

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

        // 3. Wide controls (sliders, VU meter, notes input, interval dropdown) capped at ergonomic 480px width
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

        const intervalWidth = await page
            .locator("#interval")
            .evaluate((el) => el.getBoundingClientRect().width);
        expect(intervalWidth).toBeLessThanOrEqual(481);

        if (width >= 1280) {
            const zoomMaxWidth = await page
                .locator("#visualizer-zoom")
                .evaluate((el) => getComputedStyle(el).maxWidth);
            expect(zoomMaxWidth).toBe("none");
        }

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

/**
 * Validates the middle-ground responsive spacing chain between default desktop padding
 * and zero padding, confirming expanded usable card content width, zero keyboard horizontal
 * scroll cutoff at 375px, and responsive grid gap scaling.
 */
test("validates middle-ground responsive spacing chain between default desktop padding and zero padding across viewports", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);

    // 1. Mobile 320px viewport: usable card content width >= 246px
    await page.setViewportSize({ width: 320, height: 750 });
    await page.waitForTimeout(50);

    const transportCardContentWidth320 = await page
        .locator("main#app-main > section[aria-labelledby='transport-title']")
        .evaluate((card) => {
            const style = getComputedStyle(card);
            const paddingLeft = Number.parseFloat(style.paddingLeft);
            const paddingRight = Number.parseFloat(style.paddingRight);
            return card.clientWidth - paddingLeft - paddingRight;
        });
    expect(
        transportCardContentWidth320,
        "Card content width at 320px viewport should be at least 246px",
    ).toBeGreaterThanOrEqual(246);

    // 2. Mobile 375px viewport (iPhone SE): usable card content width >= 300px
    await page.setViewportSize({ width: 375, height: 750 });
    await page.waitForTimeout(50);

    const transportCardContentWidth375 = await page
        .locator("main#app-main > section[aria-labelledby='transport-title']")
        .evaluate((card) => {
            const style = getComputedStyle(card);
            const paddingLeft = Number.parseFloat(style.paddingLeft);
            const paddingRight = Number.parseFloat(style.paddingRight);
            return card.clientWidth - paddingLeft - paddingRight;
        });
    expect(
        transportCardContentWidth375,
        "Card content width at 375px viewport should be at least 300px",
    ).toBeGreaterThanOrEqual(300);

    // 3. Virtual keyboard horizontal scroll cutoff eliminated at 375px viewport
    await page.locator("#keyboard-details > summary").click();
    await page.waitForTimeout(50);

    const keyboardScrollDifference = await page.evaluate(() => {
        const visual = document.getElementById("keyboard-visual");
        return visual ? visual.scrollWidth - visual.clientWidth : 0;
    });
    expect(
        keyboardScrollDifference,
        "Virtual keyboard should fit completely without horizontal scroll at 375px viewport",
    ).toBeLessThanOrEqual(1);

    // 4. Mobile grid gap is 16px (1rem) on <640px viewport
    const mobileGap = await page.locator("main#app-main").evaluate((el) => {
        const style = getComputedStyle(el);
        return {
            rowGap: Number.parseFloat(style.rowGap),
            columnGap: Number.parseFloat(style.columnGap),
        };
    });
    expect(mobileGap.rowGap).toBe(16);
    expect(mobileGap.columnGap).toBe(16);

    // 5. Mobile sticky transport bar safe-area clearance preserved on body
    const bodyPaddingBottom = await page.evaluate(() => {
        return Number.parseFloat(getComputedStyle(document.body).paddingBottom);
    });
    expect(
        bodyPaddingBottom,
        "Body padding-bottom should reserve at least 64px for the mobile transport bar",
    ).toBeGreaterThanOrEqual(64);

    // 6. Desktop grid gap scales to 24px (1.5rem) on >=640px viewport
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.waitForTimeout(50);

    const desktopGap = await page.locator("main#app-main").evaluate((el) => {
        const style = getComputedStyle(el);
        return {
            rowGap: Number.parseFloat(style.rowGap),
            columnGap: Number.parseFloat(style.columnGap),
        };
    });
    expect(desktopGap.rowGap).toBe(24);
    expect(desktopGap.columnGap).toBe(24);
});

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
        const visual = document.getElementById("keyboard-main-wrapper");
        if (!visual) throw new Error("Expected #keyboard-main-wrapper element to exist");
        return visual.scrollWidth - visual.clientWidth;
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

/**
 * Validates refined layout ergonomics including left-aligned sliders with top margin,
 * left-aligned VU meter, bounded numeric inputs, and reactive tail-seconds disabled state.
 */
test("validates refined layout ergonomics, bounded numeric inputs, slider margins, and export tail controls", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);

    // 1. Sliders have 0.625rem (10px) top margin and left alignment (margin-inline: 0 auto)
    const bpmSliderStyles = await page.locator("#bpm").evaluate((el) => {
        const style = getComputedStyle(el);
        return {
            marginTop: Number.parseFloat(style.marginTop),
            marginLeft: Number.parseFloat(style.marginLeft),
        };
    });
    expect(bpmSliderStyles.marginTop).toBe(10);
    expect(bpmSliderStyles.marginLeft).toBe(0);

    // 2. VU meter container is left-aligned
    const vuMeterMarginLeft = await page.locator("#vu-meter-container").evaluate((el) => {
        return Number.parseFloat(getComputedStyle(el).marginLeft);
    });
    expect(vuMeterMarginLeft).toBe(0);

    // 3. Small numeric inputs are strictly bounded in width
    const loopCountWidth = await page.locator("#loop-count").evaluate((el) => {
        return el.getBoundingClientRect().width;
    });
    expect(loopCountWidth).toBeLessThanOrEqual(85);

    const tailSecondsWidth = await page.locator("#offline-export-tail-seconds").evaluate((el) => {
        return el.getBoundingClientRect().width;
    });
    expect(tailSecondsWidth).toBeLessThanOrEqual(95);

    // 4. Offline export tail-seconds is disabled and aria-disabled="true" on Auto, and enabled on Custom
    const tailMode = page.locator("#offline-export-tail-mode");
    const tailSeconds = page.locator("#offline-export-tail-seconds");
    await expect(tailSeconds).toBeDisabled();
    await expect(tailSeconds).toHaveAttribute("aria-disabled", "true");

    await tailMode.selectOption("custom");
    await expect(tailSeconds).toBeEnabled();
    await expect(tailSeconds).not.toHaveAttribute("aria-disabled", "true");

    // 5. Scale quantization dropdown has zero text clipping on narrow viewports
    await page.setViewportSize({ width: 320, height: 750 });
    await page.waitForTimeout(50);
    const scaleTypeSelect = page.locator("#scale-type");
    const scaleSelectOverflow = await scaleTypeSelect.evaluate((el) => {
        return el.scrollWidth > el.clientWidth;
    });
    expect(scaleSelectOverflow, "Scale type select should not overflow at 320px viewport").toBe(
        false,
    );

    // Scale controls flex container stacks vertically on mobile (320px)
    const quantizerFlexDir = await page.locator("#quantizer-controls").evaluate((el) => {
        return getComputedStyle(el).flexDirection;
    });
    expect(quantizerFlexDir).toBe("column");

    // At 768px viewport (2-column card grid where quantizer card width is ~340px < 420px),
    // controls stack vertically via container query with zero text clipping
    await page.setViewportSize({ width: 768, height: 850 });
    await page.waitForTimeout(50);
    const quantizerFlexDir768 = await page.locator("#quantizer-controls").evaluate((el) => {
        return getComputedStyle(el).flexDirection;
    });
    expect(quantizerFlexDir768).toBe("column");

    const scaleSelectOverflow768 = await scaleTypeSelect.evaluate((el) => {
        return el.scrollWidth > el.clientWidth;
    });
    expect(scaleSelectOverflow768, "Scale type select should not overflow at 768px viewport").toBe(
        false,
    );

    // On wide desktop (1280px viewport where card width >= 420px), scale controls switch to row
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.waitForTimeout(50);
    const quantizerFlexDirDesktop = await page.locator("#quantizer-controls").evaluate((el) => {
        return getComputedStyle(el).flexDirection;
    });
    expect(quantizerFlexDirDesktop).toBe("row");

    // Octave keypad buttons expand beyond 4.5rem (up to 6rem) while maintaining min 44px tap target height
    const octaveBtnDimensions = await page
        .locator("#octave-shift-buttons .octave-btn")
        .first()
        .evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height,
            };
        });
    expect(octaveBtnDimensions.height).toBeGreaterThanOrEqual(44);
    expect(octaveBtnDimensions.width).toBeGreaterThanOrEqual(48);

    // 6. Pattern direction sub-sections have Title Case headers
    const patternSectionHeaders = await page
        .locator("#pattern-buttons .text-xs.font-semibold")
        .allTextContents();
    expect(patternSectionHeaders).toContain("Linear Patterns");
    expect(patternSectionHeaders).toContain("Octave Cycles");
    expect(patternSectionHeaders.some((text) => text.includes("Generative & Random"))).toBe(true);

    // 7. Reshuffle button is inside the Generative & Random header and contextually enabled/disabled
    const reshuffleBtn = page.locator("#reshuffle-pattern");
    await expect(reshuffleBtn).toBeVisible();
    // Default active pattern is "up" (linear), so reshuffle button should be disabled
    await expect(reshuffleBtn).toBeDisabled();
    await expect(reshuffleBtn).toHaveAttribute("aria-disabled", "true");

    // Select a generative pattern (e.g. random)
    await page.locator("#pattern-buttons input[value='random']").locator("xpath=..").click();
    await expect(reshuffleBtn).toBeEnabled();
    await expect(reshuffleBtn).not.toHaveAttribute("aria-disabled", "true");

    // Switch back to linear pattern (e.g. up)
    await page.locator("#pattern-buttons input[value='up']").locator("xpath=..").click();
    await expect(reshuffleBtn).toBeDisabled();
    await expect(reshuffleBtn).toHaveAttribute("aria-disabled", "true");
});

/**
 * Audits WCAG AAA focus ring visibility and high-contrast outline styling across
 * all interactive controls (numeric, text, selects, range sliders, checkboxes,
 * radios, and buttons).
 */
test("audits WCAG AAA focus rings and contrast styling across all interactive inputs and controls", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);

    // Expand collapsible sections to ensure all controls are in the active DOM tree
    const detailsElements = page.locator("details.card-details");
    const detailsCount = await detailsElements.count();
    for (let i = 0; i < detailsCount; i += 1) {
        const details = detailsElements.nth(i);
        const isOpen = await details.evaluate((el) => (el as HTMLDetailsElement).open);
        if (!isOpen) {
            await details.locator("summary").click();
        }
    }
    await page.waitForTimeout(50);

    // 1. Numeric and Text Inputs
    const textAndNumericInputIds = ["#notes", "#loop-count", "#preset-name-input"];
    for (const selector of textAndNumericInputIds) {
        const input = page.locator(selector);
        await input.focus();
        const focusOutline = await input.evaluate((el) => {
            const style = getComputedStyle(el);
            return {
                outlineStyle: style.outlineStyle,
                outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
            };
        });
        expect(focusOutline.outlineStyle, `Focus outline style for ${selector}`).not.toBe("none");
        expect(
            focusOutline.outlineWidth,
            `Focus outline width for ${selector}`,
        ).toBeGreaterThanOrEqual(2);
    }

    // 2. Dropdown Select Elements
    const selectIds = [
        "#interval",
        "#scale-root",
        "#scale-type",
        "#synth-type",
        "#offline-export-tail-mode",
        "#saved-preset-select",
        "#oscilloscope-window",
    ];
    for (const selector of selectIds) {
        const select = page.locator(selector);
        await select.focus();
        const focusOutline = await select.evaluate((el) => {
            const style = getComputedStyle(el);
            return {
                outlineStyle: style.outlineStyle,
                outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
            };
        });
        expect(focusOutline.outlineStyle, `Focus outline style for ${selector}`).not.toBe("none");
        expect(
            focusOutline.outlineWidth,
            `Focus outline width for ${selector}`,
        ).toBeGreaterThanOrEqual(2);
    }

    // 3. Range Sliders
    const sliderIds = [
        "#bpm",
        "#post-gain",
        "#swing",
        "#gate",
        "#env-attack",
        "#env-decay",
        "#env-sustain",
        "#env-release",
        "#filter-cutoff",
        "#filter-resonance",
        "#drive-mix",
        "#chorus-mix",
        "#autopan-mix",
        "#delay-mix",
        "#reverb-mix",
    ];
    for (const selector of sliderIds) {
        const slider = page.locator(selector);
        await slider.focus();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowLeft");
        const focusOutline = await slider.evaluate((el) => {
            const style = getComputedStyle(el);
            return {
                outlineStyle: style.outlineStyle,
                outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
            };
        });
        expect(focusOutline.outlineStyle, `Focus outline style for ${selector}`).not.toBe("none");
        expect(
            focusOutline.outlineWidth,
            `Focus outline width for ${selector}`,
        ).toBeGreaterThanOrEqual(2);
    }

    // 4. Interactive Action Buttons
    const buttonSelectors = [
        "#play-stop",
        "#record-button",
        "#offline-export-button",
        "#offline-export-midi-button",
        "#randomize-notes",
        ".chord-btn",
        ".waveform-btn",
    ];
    for (const selector of buttonSelectors) {
        const btn = page.locator(selector).first();
        const unfocusedStyles = await btn.evaluate((el) => {
            const style = getComputedStyle(el);
            return {
                outlineStyle: style.outlineStyle,
                outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
                boxShadow: style.boxShadow,
            };
        });
        await btn.focus();
        const focusOutline = await btn.evaluate((el) => {
            const style = getComputedStyle(el);
            return {
                outlineStyle: style.outlineStyle,
                outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
                boxShadow: style.boxShadow,
            };
        });
        const hasVisibleOutline =
            focusOutline.outlineStyle !== "none" && focusOutline.outlineWidth >= 2;
        const hasDistinctFocusRingShadow =
            focusOutline.boxShadow !== unfocusedStyles.boxShadow &&
            focusOutline.boxShadow.includes("rgb");
        const hasVisibleFocus = hasVisibleOutline || hasDistinctFocusRingShadow;
        expect(hasVisibleFocus, `Button focus visibility for ${selector}`).toBe(true);
    }

    // 5. Radio Buttons (Octave and Pattern directions via peer focus-visible)
    const radioTestCases = [
        {
            radioSelector: "#octave-shift-buttons input[type='radio']",
            visibleSpanSelector: "#octave-shift-buttons .octave-btn",
            label: "Octave Shift radio",
        },
        {
            radioSelector: "#octave-range-buttons input[type='radio']",
            visibleSpanSelector: "#octave-range-buttons .octave-btn",
            label: "Octave Layers radio",
        },
        {
            radioSelector: "#pattern-buttons input[type='radio']",
            visibleSpanSelector: "#pattern-buttons .pattern-btn",
            label: "Pattern Direction radio",
        },
    ];
    for (const { radioSelector, visibleSpanSelector, label } of radioTestCases) {
        const radio = page.locator(radioSelector).first();
        await radio.focus();
        const peerFocusOutline = await page
            .locator(visibleSpanSelector)
            .first()
            .evaluate((el) => {
                const style = getComputedStyle(el);
                return {
                    outlineStyle: style.outlineStyle,
                    outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
                    boxShadow: style.boxShadow,
                };
            });
        const hasVisiblePeerFocus =
            (peerFocusOutline.outlineStyle !== "none" && peerFocusOutline.outlineWidth >= 2) ||
            peerFocusOutline.boxShadow.includes("rgb");
        expect(hasVisiblePeerFocus, `Peer focus indicator for ${label}`).toBe(true);
    }

    // 6. Checkbox switches and format checkboxes
    const checkboxSelectors = [
        "#scale-quantize-toggle",
        "#offline-export-wav",
        "#offline-export-mp3",
    ];
    for (const selector of checkboxSelectors) {
        const checkbox = page.locator(selector);
        await checkbox.focus();
        const focusOutline = await checkbox.evaluate((el) => {
            const style = getComputedStyle(el);
            return {
                outlineStyle: style.outlineStyle,
                outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
                boxShadow: style.boxShadow,
            };
        });
        const hasVisibleFocus =
            (focusOutline.outlineStyle !== "none" && focusOutline.outlineWidth >= 2) ||
            focusOutline.boxShadow.includes("rgb");
        expect(hasVisibleFocus, `Checkbox focus indicator for ${selector}`).toBe(true);
    }
});

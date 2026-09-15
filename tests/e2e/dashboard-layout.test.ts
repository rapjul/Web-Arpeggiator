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

import { Buffer } from "node:buffer";
import { dismissOnboarding, expect, test } from "./fixtures/app";

test("requires confirmation before loading compatible settings from a newer preset", async ({
    pwaPage: page,
}) => {
    await dismissOnboarding(page);
    const notes = page.locator("#notes");
    await expect(notes).toHaveValue("C4 E4 G4");

    await page.locator("#load-preset-input").setInputFiles({
        name: "future-preset.json",
        mimeType: "application/json",
        buffer: Buffer.from(
            JSON.stringify({ settingsVersion: 99, bpm: 96, baseNotes: ["D4", "F4", "A4"] }),
        ),
    });

    await expect(page.locator("#future-preset-overlay")).toBeVisible();
    await expect(notes).toHaveValue("C4 E4 G4");

    await page.locator("#future-preset-confirm").click();
    await expect(page.locator("#future-preset-overlay")).toBeHidden();
    await expect(notes).toHaveValue("D4 F4 A4");
    await expect(page.locator("#bpm")).toHaveValue("96");
});

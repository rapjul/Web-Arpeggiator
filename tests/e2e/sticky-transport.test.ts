import { expect, test } from "./fixtures/app";

async function transportPosition(page: import("@playwright/test").Page): Promise<string> {
    return page.locator(".sticky-transport-bar").evaluate((bar) => getComputedStyle(bar).position);
}

test("uses sticky desktop and fixed mobile transport placement", async ({ pwaPage: page }) => {
    await expect(page.locator(".sticky-transport-bar")).toBeVisible();

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(() => transportPosition(page)).toBe("sticky");

    await page.setViewportSize({ width: 375, height: 667 });
    await expect.poll(() => transportPosition(page)).toBe("fixed");
});

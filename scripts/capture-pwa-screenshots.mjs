import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PWA_SCREENSHOT_URL ?? "http://127.0.0.1:3000/index.html";
const screenshotDir = resolve(import.meta.dirname, "../public/images/screenshots");

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch();
try {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("#start-overlay").click();
    await page.locator("#play-stop").waitFor({ state: "visible" });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: resolve(screenshotDir, "desktop.png"), fullPage: true });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.screenshot({ path: resolve(screenshotDir, "mobile.png"), fullPage: true });
} finally {
    await browser.close();
}

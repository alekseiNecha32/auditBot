import type { Browser } from "playwright-core";
import { launchBrowser } from "@/lib/browser";
import { highlightAndScreenshot } from "@/lib/collectors/screenshotUtil";
import type { PageScreenshot } from "@/lib/types";

// Read-only: navigates and screenshots, never clicks anything, so unlike
// siteWalk.ts this is safe to run against any target website regardless of
// confirmed ownership (same safety profile as checkWebsite's homepage fetch).
export async function captureHomepageScreenshot(url: string): Promise<PageScreenshot | null> {
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch {
      await context.close().catch(() => {});
      return null;
    }
    // Many storefronts (Shopify/Wix/etc.) still show a loading spinner/blank
    // screen right after domcontentloaded while client-side JS finishes
    // rendering. Give the page a real chance to settle before screenshotting,
    // without letting a chatty site (analytics polling, etc.) hang us forever.
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    const shot = await highlightAndScreenshot(page, url, "Homepage", ["h1"]);
    await context.close().catch(() => {});
    return shot;
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}

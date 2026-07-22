import type { Page } from "playwright-core";
import type { PageScreenshot } from "@/lib/types";

// Best-effort: outlines the first visible element matching any selector
// (checked in order) in red, scrolls it into view, then screenshots the
// current viewport. Returns null on any failure rather than throwing, same
// pattern as the other collectors in this pipeline.
export async function highlightAndScreenshot(
  page: Page,
  pageUrl: string,
  label: string,
  selectorCandidates: string[]
): Promise<PageScreenshot | null> {
  try {
    const highlighted = await page.evaluate((selectors: string[]) => {
      for (const sel of selectors) {
        let candidates: HTMLElement[] = [];
        try {
          candidates = Array.from(document.querySelectorAll<HTMLElement>(sel));
        } catch {
          continue;
        }
        // Some themes render duplicate elements (e.g. slider slides) sharing
        // the same tag/class where only one is actually the active/visible
        // one — querySelector alone would silently grab the wrong one.
        const el = candidates.find((c) => {
          if (c.offsetWidth === 0 || c.offsetHeight === 0) return false;
          const style = getComputedStyle(c);
          return style.visibility !== "hidden" && style.opacity !== "0" && style.display !== "none";
        });
        if (el) {
          el.style.outline = "4px solid #ef4444";
          el.style.outlineOffset = "2px";
          el.scrollIntoView({ block: "center" });
          const firstClass = typeof el.className === "string" ? el.className.split(" ")[0] : "";
          return el.tagName.toLowerCase() + (firstClass ? `.${firstClass}` : "");
        }
      }
      return null;
    }, selectorCandidates);

    // Even if no candidate selector matched, still capture the page as-is —
    // it's useful visual context even without a highlighted element.
    // Let the outline/scroll settle before capturing.
    await page.waitForTimeout(150);
    const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
    return {
      pageUrl,
      label,
      imageBase64: `data:image/jpeg;base64,${buffer.toString("base64")}`,
      highlightedElement: highlighted,
    };
  } catch {
    return null;
  }
}

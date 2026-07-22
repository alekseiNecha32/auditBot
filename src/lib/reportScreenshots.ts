import type { AuditReport, CollectedData, ReportGap } from "@/lib/types";

const IMAGE_OMITTED_PLACEHOLDER = "[omitted from this JSON — screenshots aren't sent to text-only prompts]";

// Screenshots carry ~50-100KB of base64 each. JSON.stringify-ing them into a
// text prompt (synthesizer, or the chat's non-vision JSON dump) burns tens of
// thousands of tokens for no benefit and can blow through TPM rate limits —
// so every text-prompt builder must strip them before embedding CollectedData.
export function stripCollectedScreenshots(collected: CollectedData): CollectedData {
  return {
    ...collected,
    homepageScreenshot: collected.homepageScreenshot
      ? { ...collected.homepageScreenshot, imageBase64: IMAGE_OMITTED_PLACEHOLDER }
      : null,
    productSample: collected.productSample
      ? {
          ...collected.productSample,
          screenshot: collected.productSample.screenshot
            ? { ...collected.productSample.screenshot, imageBase64: IMAGE_OMITTED_PLACEHOLDER }
            : null,
        }
      : null,
  };
}

export function stripReportScreenshots(report: AuditReport): AuditReport {
  return {
    ...report,
    gaps: report.gaps.map((gap) =>
      gap.screenshot ? { ...gap, screenshot: { ...gap.screenshot, imageBase64: IMAGE_OMITTED_PLACEHOLDER } } : gap
    ),
  };
}

// Deterministic post-processing, never seen or produced by the LLM: matches
// each gap's title against known categories and attaches the corresponding
// screenshot captured during collection, so the report/chat can show visual
// evidence without asking the model to handle image data.
export function attachGapScreenshots(gaps: ReportGap[], collected: CollectedData): ReportGap[] {
  return gaps.map((gap) => {
    const title = gap.title.toLowerCase();

    if (title.includes("seo keyword") && collected.homepageScreenshot) {
      return {
        ...gap,
        screenshot: {
          imageBase64: collected.homepageScreenshot.imageBase64,
          caption: `Your homepage — the highlighted heading is a good spot to work these keyword phrases into, in addition to your <title> tag and meta description.`,
        },
      };
    }

    if (
      (title.includes("description") || title.includes("bouquet") || title.includes("product copy")) &&
      collected.productSample?.screenshot
    ) {
      return {
        ...gap,
        screenshot: {
          imageBase64: collected.productSample.screenshot.imageBase64,
          caption: `The product page (${collected.productSample.url}) with its current description highlighted.`,
        },
      };
    }

    return gap;
  });
}

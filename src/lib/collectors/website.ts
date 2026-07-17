import * as cheerio from "cheerio";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { OnPageSeoSignals, WebsiteCheck } from "@/lib/types";

const LOCAL_BUSINESS_TYPES = new Set(["LocalBusiness", "FloristShop", "Store", "Organization"]);

// Phrases that matter for a florist's on-page SEO specifically — not a
// generic SEO checklist. Matched case-insensitively against title + meta
// description + first H1 combined.
const FLORIST_KEYWORDS = [
  "same day delivery",
  "same-day delivery",
  "wedding florist",
  "wedding flowers",
  "sympathy flowers",
  "funeral flowers",
  "flower delivery",
  "local florist",
  "florist near me",
  "flower subscription",
  "flower arrangements",
  "fresh flowers",
  "flower shop",
  "floral design",
  "custom arrangements",
];

function extractSeoSignals($: cheerio.CheerioAPI): OnPageSeoSignals {
  const title = $("title").first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  const h1s = $("h1");
  const h1Count = h1s.length;
  const h1Text = h1Count > 0 ? h1s.first().text().trim() || null : null;

  let hasLocalBusinessStructuredData = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (hasLocalBusinessStructuredData) return;
    try {
      const parsed = JSON.parse($(el).contents().text());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      if (nodes.some((n) => LOCAL_BUSINESS_TYPES.has(n?.["@type"]))) {
        hasLocalBusinessStructuredData = true;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  const combinedText = [title, metaDescription, h1Text].filter(Boolean).join(" ").toLowerCase();
  const matchedFloristKeywords = FLORIST_KEYWORDS.filter((kw) => combinedText.includes(kw));

  return {
    title,
    titleLength: title?.length ?? null,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? null,
    h1Count,
    h1Text,
    hasLocalBusinessStructuredData,
    matchedFloristKeywords,
  };
}

const ORDERING_KEYWORDS = ["order online", "order now", "shop now", "buy flowers", "start an order"];
const ORDERING_DOMAINS = [
  "bloomnation.com",
  "floranext.com",
  "squareup.com",
  "square.site",
  "shopify.com",
  "myshopify.com",
  "ftd.com",
  "teleflora.com",
  "doordash.com",
  "ubereats.com",
  "toasttab.com",
  "lightspeed",
];

const PHONE_REGEX = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const DELIVERY_FEE_REGEX = /delivery\s*(fee|charge|cost)?[^.$]{0,20}\$\s?\d+(\.\d{2})?|\$\s?\d+(\.\d{2})?[^.$]{0,20}delivery/i;

async function getPageSpeedScore(url: string, strategy: "mobile" | "desktop"): Promise<{
  score: number | null;
  viewportOk: boolean | null;
  error: string | null;
}> {
  try {
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("strategy", strategy);
    endpoint.searchParams.set("category", "performance");
    if (env.PAGESPEED_API_KEY) endpoint.searchParams.set("key", env.PAGESPEED_API_KEY);

    // Real Lighthouse audits routinely take well past 25s; give this real headroom
    // rather than reporting a false "couldn't verify" from our own timeout.
    const res = await fetchWithTimeout(endpoint.toString(), {}, 55000);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { score: null, viewportOk: null, error: `PageSpeed API ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json();
    const perfScore = data?.lighthouseResult?.categories?.performance?.score;
    const viewportAudit = data?.lighthouseResult?.audits?.viewport;
    return {
      score: typeof perfScore === "number" ? Math.round(perfScore * 100) : null,
      viewportOk: typeof viewportAudit?.score === "number" ? viewportAudit.score === 1 : null,
      error: null,
    };
  } catch (err) {
    return { score: null, viewportOk: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkWebsite(url: string, prefetchedHtml: string | null): Promise<WebsiteCheck> {
  const errors: string[] = [];
  let html = prefetchedHtml;
  let finalUrl: string | null = html ? url : null;
  let reachable = html !== null;
  let ssl = url.startsWith("https://");

  if (!html) {
    try {
      const res = await fetchWithTimeout(url, { redirect: "follow" }, 12000);
      finalUrl = res.url || url;
      ssl = finalUrl.startsWith("https://");
      reachable = res.ok;
      if (res.ok) html = await res.text();
      else errors.push(`Homepage returned HTTP ${res.status}`);
    } catch (err) {
      errors.push(`Couldn't fetch homepage: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let visiblePhone: string | null = null;
  let visibleEmail: string | null = null;
  let onlineOrderingDetected = false;
  let onlineOrderingEvidence: string | null = null;
  let visibleDeliveryFee: string | null = null;
  let seo: OnPageSeoSignals = {
    title: null,
    titleLength: null,
    metaDescription: null,
    metaDescriptionLength: null,
    h1Count: 0,
    h1Text: null,
    hasLocalBusinessStructuredData: false,
    matchedFloristKeywords: [],
  };

  if (html) {
    const $ = cheerio.load(html);
    const bodyText = $("body").text().replace(/\s+/g, " ");

    seo = extractSeoSignals($);
    visibleDeliveryFee = bodyText.match(DELIVERY_FEE_REGEX)?.[0]?.trim() ?? null;

    const telHref = $('a[href^="tel:"]').first().attr("href");
    visiblePhone = telHref ? telHref.replace("tel:", "").trim() : bodyText.match(PHONE_REGEX)?.[0] ?? null;

    const mailtoHref = $('a[href^="mailto:"]').first().attr("href");
    visibleEmail = mailtoHref ? mailtoHref.replace("mailto:", "").trim() : bodyText.match(EMAIL_REGEX)?.[0] ?? null;

    const lowerText = bodyText.toLowerCase();
    const keywordHit = ORDERING_KEYWORDS.find((k) => lowerText.includes(k));
    if (keywordHit) {
      onlineOrderingDetected = true;
      onlineOrderingEvidence = `Found the phrase "${keywordHit}" on the homepage.`;
    } else {
      const hrefs = $("a[href]")
        .map((_, el) => $(el).attr("href") ?? "")
        .get();
      const domainHit = ORDERING_DOMAINS.find((d) => hrefs.some((h) => h.includes(d)));
      if (domainHit) {
        onlineOrderingDetected = true;
        onlineOrderingEvidence = `Found a homepage link to an ordering platform (${domainHit}).`;
      }
    }
  }

  const [mobile, desktop] = await Promise.all([
    getPageSpeedScore(url, "mobile"),
    getPageSpeedScore(url, "desktop"),
  ]);
  if (mobile.error) errors.push(`Mobile PageSpeed: ${mobile.error}`);
  if (desktop.error) errors.push(`Desktop PageSpeed: ${desktop.error}`);

  return {
    requestedUrl: url,
    finalUrl,
    reachable,
    ssl,
    pageSpeedScoreMobile: mobile.score,
    pageSpeedScoreDesktop: desktop.score,
    mobileFriendly: mobile.viewportOk,
    visiblePhone,
    visibleEmail,
    seo,
    onlineOrderingDetected,
    onlineOrderingEvidence,
    visibleDeliveryFee,
    errors,
  };
}

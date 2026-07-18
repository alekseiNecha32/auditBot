import { resolveBusiness } from "@/lib/collectors/resolveBusiness";
import { findCompetitors } from "@/lib/collectors/places";
import { checkWebsite, computeTopMissingKeywords } from "@/lib/collectors/website";
import { runSiteWalk } from "@/lib/collectors/siteWalk";
import { runAiVisibility } from "@/lib/collectors/aiVisibility";
import { assessPhotoQuality } from "@/lib/collectors/photoQuality";
import { searchBrandedName } from "@/lib/collectors/brandedSearch";
import { synthesizeReport } from "@/lib/synthesizer";
import { completeReport, failReport, updateReportCollected, updateReportStatus } from "@/lib/db";
import { env } from "@/lib/env";
import type { CollectedData } from "@/lib/types";

const FLOWER_CATEGORY = "flower";

function guessCityFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim());
  // Typical Google formattedAddress: "street, city, state zip, country"
  if (parts.length >= 3) return parts[parts.length - 3];
  if (parts.length === 2) return parts[0];
  return null;
}

export async function runAuditPipeline(
  slug: string,
  rawInput: string,
  ownsWebsite: boolean
): Promise<void> {
  try {
    await updateReportStatus(slug, "resolving");
    const resolved = await resolveBusiness(rawInput);
    const warnings = [...resolved.warnings];

    await updateReportStatus(slug, "collecting");

    const targetWebsiteUrl = resolved.target.website;
    if (!targetWebsiteUrl) {
      warnings.push(
        "No website was found on this business's Google listing, so website performance, ordering-flow, and contact-info checks couldn't be run."
      );
    } else if (!ownsWebsite) {
      warnings.push(
        "The ordering-flow (catalog/cart/checkout) walk was skipped because website ownership wasn't confirmed. Only public, passive checks (SSL, PageSpeed, visible contact info) were run against this site, the same as for competitors."
      );
    }

    const [competitors, website, siteWalk] = await Promise.all([
      findCompetitors(resolved.target),
      targetWebsiteUrl ? checkWebsite(targetWebsiteUrl, resolved.homepageHtml) : Promise.resolve(null),
      targetWebsiteUrl && ownsWebsite ? runSiteWalk(targetWebsiteUrl) : Promise.resolve(null),
    ]);

    const [competitorWebsites, photoQuality] = await Promise.all([
      Promise.all(
        competitors.map(async (c) => ({
          placeId: c.placeId,
          name: c.name,
          website: c.website ? await checkWebsite(c.website, null) : null,
        }))
      ),
      Promise.all(
        [resolved.target, ...competitors].map(async (b) => ({
          placeId: b.placeId,
          name: b.name,
          assessment: await assessPhotoQuality(b).catch(() => null),
        }))
      ),
    ]);

    const topMissingKeywords = computeTopMissingKeywords(website, competitorWebsites);

    const city =
      resolved.input.type === "name_city" && resolved.input.city
        ? resolved.input.city
        : guessCityFromAddress(resolved.target.address);
    if (!city) warnings.push("Couldn't determine the business's city; AI-visibility prompts used a generic 'the area' phrasing instead.");

    if (!env.GOOGLE_CSE_ID) {
      warnings.push("Branded name-search check skipped: Custom Search API isn't configured (set GOOGLE_CSE_ID).");
    }

    const businessNames = [resolved.target.name, ...competitors.map((c) => c.name)];
    const [aiVisibility, brandedSearch] = await Promise.all([
      runAiVisibility(FLOWER_CATEGORY, city ?? "", businessNames),
      env.GOOGLE_CSE_ID
        ? Promise.all(
            [resolved.target, ...competitors].map(async (b) => ({
              placeId: b.placeId,
              name: b.name,
              result: await searchBrandedName(b.name, city, b.website).catch(() => null),
            }))
          )
        : Promise.resolve([]),
    ]);

    const collected: CollectedData = {
      input: resolved.input,
      target: resolved.target,
      competitors,
      website,
      siteWalk,
      competitorWebsites,
      photoQuality,
      brandedSearch,
      topMissingKeywords,
      aiVisibility,
      collectedAt: new Date().toISOString(),
      warnings,
    };

    await updateReportCollected(slug, collected);
    await updateReportStatus(slug, "synthesizing");

    const report = await synthesizeReport(collected);
    await completeReport(slug, report);
  } catch (err) {
    await failReport(slug, err instanceof Error ? err.message : String(err));
  }
}

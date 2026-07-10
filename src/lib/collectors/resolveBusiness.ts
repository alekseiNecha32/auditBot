import * as cheerio from "cheerio";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { classifyInput } from "@/lib/classifyInput";
import { domainOf } from "@/lib/domain";
import { getPlaceDetails, textSearchPlaces } from "@/lib/collectors/places";
import type { BusinessProfile, ResolvedInput } from "@/lib/types";

interface FetchedHomepage {
  finalUrl: string;
  html: string | null;
  error: string | null;
}

export async function fetchHomepage(url: string): Promise<FetchedHomepage> {
  try {
    const res = await fetchWithTimeout(url, { redirect: "follow" }, 12000);
    if (!res.ok) {
      return { finalUrl: res.url || url, html: null, error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    return { finalUrl: res.url || url, html, error: null };
  } catch (err) {
    return { finalUrl: url, html: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function extractCandidateFromHtml(html: string): { name: string | null; city: string | null } {
  const $ = cheerio.load(html);

  const jsonLdCity = (): string | null => {
    let city: string | null = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (city) return;
      try {
        const raw = $(el).contents().text();
        const parsed = JSON.parse(raw);
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of nodes) {
          const address = node?.address;
          if (address?.addressLocality) {
            city = String(address.addressLocality);
          }
        }
      } catch {
        // ignore malformed JSON-LD
      }
    });
    return city;
  };

  const jsonLdName = (): string | null => {
    let name: string | null = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (name) return;
      try {
        const raw = $(el).contents().text();
        const parsed = JSON.parse(raw);
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of nodes) {
          if (node?.name && (node["@type"] === "LocalBusiness" || node["@type"] === "FloristShop" || node["@type"] === "Organization")) {
            name = String(node.name);
          }
        }
      } catch {
        // ignore malformed JSON-LD
      }
    });
    return name;
  };

  const name =
    jsonLdName() ||
    $('meta[property="og:site_name"]').attr("content") ||
    $("title").first().text().split(/[|\-–]/)[0]?.trim() ||
    null;

  const city = jsonLdCity();

  return { name: name?.trim() || null, city };
}

export interface ResolveResult {
  input: ResolvedInput;
  target: BusinessProfile;
  homepageHtml: string | null;
  homepageFinalUrl: string | null;
  warnings: string[];
}

export async function resolveBusiness(rawInput: string): Promise<ResolveResult> {
  const warnings: string[] = [];
  const trimmed = rawInput.trim();
  const resolvedInput: ResolvedInput = classifyInput(trimmed);

  let candidateName: string | null = null;
  let candidateCity: string | null = null;
  let homepageHtml: string | null = null;
  let homepageFinalUrl: string | null = null;
  let inputUrl: string | null = null;

  if (resolvedInput.type === "url") {
    inputUrl = resolvedInput.url;
    const fetched = await fetchHomepage(inputUrl);
    homepageFinalUrl = fetched.finalUrl;
    if (fetched.html) {
      homepageHtml = fetched.html;
      const extracted = extractCandidateFromHtml(fetched.html);
      candidateName = extracted.name;
      candidateCity = extracted.city;
    } else {
      warnings.push(`Couldn't fetch the provided website (${fetched.error}); falling back to domain name for search.`);
    }
    if (!candidateName) {
      candidateName = domainOf(inputUrl)?.split(".")[0] ?? trimmed;
      warnings.push("Couldn't confidently extract a business name from the website; used the domain name for lookup instead.");
    }
    if (!candidateCity) {
      warnings.push("Couldn't determine the business's city from the website; competitor search may be less accurate.");
    }
  } else {
    candidateName = resolvedInput.name;
    candidateCity = resolvedInput.city || null;
    if (!candidateCity) {
      warnings.push("No city was provided; search results may be less precise.");
    }
  }

  const query = [candidateName, candidateCity].filter(Boolean).join(" ");
  const results = await textSearchPlaces(query);
  if (results.length === 0) {
    throw new Error(`No Google Places results found for "${query}"`);
  }

  let bestId = results[0].id;
  if (inputUrl) {
    const wantedDomain = domainOf(inputUrl);
    const domainMatch = results.find((r) => r.websiteUri && domainOf(r.websiteUri) === wantedDomain);
    if (domainMatch) {
      bestId = domainMatch.id;
    } else {
      warnings.push("Couldn't confirm the Google Business Profile by matching website domain; used the top text-search match instead.");
    }
  }

  const target = await getPlaceDetails(bestId, true);

  return { input: resolvedInput, target, homepageHtml, homepageFinalUrl, warnings };
}

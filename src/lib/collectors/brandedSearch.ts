import { env } from "@/lib/env";
import { domainOf } from "@/lib/domain";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { BrandedSearchResult } from "@/lib/types";

const CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";

interface CseItem {
  title?: string;
  link?: string;
  snippet?: string;
}

// Uses Google's official Custom Search JSON API — not scraping search
// results, which would violate Google's Terms of Service. Requires the
// caller to have set up a Programmable Search Engine (search.google.com/cse)
// configured to search the whole web, and enabled the Custom Search API.
export async function searchBrandedName(
  businessName: string,
  city: string | null,
  ownWebsite: string | null
): Promise<BrandedSearchResult> {
  const cseId = env.GOOGLE_CSE_ID;
  if (!cseId) {
    return { ranksFirst: null, topResults: [], error: "Custom Search API not configured (GOOGLE_CSE_ID unset)." };
  }

  try {
    const query = [businessName, city].filter(Boolean).join(" ");
    const url = new URL(CSE_ENDPOINT);
    url.searchParams.set("key", env.GOOGLE_PLACES_API_KEY);
    url.searchParams.set("cx", cseId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "10");

    const res = await fetchWithTimeout(url.toString(), {}, 10000);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ranksFirst: null, topResults: [], error: `Custom Search API ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = (await res.json()) as { items?: CseItem[] };
    const topResults = (data.items ?? []).slice(0, 10).map((item) => ({
      title: item.title ?? "",
      link: item.link ?? "",
      snippet: item.snippet ?? "",
    }));

    let ranksFirst: boolean | null = null;
    const ownDomain = ownWebsite ? domainOf(ownWebsite) : null;
    if (ownDomain && topResults.length > 0) {
      ranksFirst = domainOf(topResults[0].link) === ownDomain;
    }

    return { ranksFirst, topResults, error: null };
  } catch (err) {
    return { ranksFirst: null, topResults: [], error: err instanceof Error ? err.message : String(err) };
  }
}

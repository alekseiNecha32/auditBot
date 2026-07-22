import { env } from "@/lib/env";
import { domainOf } from "@/lib/domain";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { BrandedSearchResult } from "@/lib/types";

const SERPER_ENDPOINT = "https://google.serper.dev/search";

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
}

// Uses serper.dev, a third-party proxy that returns real Google SERP
// results. Google's own Custom Search JSON API stopped granting access to
// new projects/customers in 2026 (closed ahead of its Jan 1 2027 shutdown),
// so this talks to Serper instead while keeping the same
// real-Google-results semantics the rest of the app relies on.
export async function searchBrandedName(
  businessName: string,
  city: string | null,
  ownWebsite: string | null
): Promise<BrandedSearchResult> {
  const apiKey = env.SERPER_API_KEY;
  if (!apiKey) {
    return { ranksFirst: null, topResults: [], error: "Branded search not configured (SERPER_API_KEY unset)." };
  }

  try {
    const query = [businessName, city].filter(Boolean).join(" ");
    const res = await fetchWithTimeout(
      SERPER_ENDPOINT,
      {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: 10 }),
      },
      10000
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ranksFirst: null, topResults: [], error: `Serper API ${res.status}: ${body.slice(0, 200)}` };
    }

    const data = (await res.json()) as { organic?: SerperOrganicResult[] };
    const topResults = (data.organic ?? []).slice(0, 10).map((item) => ({
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

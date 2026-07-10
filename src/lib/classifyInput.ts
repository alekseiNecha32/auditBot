import type { ResolvedInput } from "@/lib/types";

export function classifyInput(raw: string): ResolvedInput {
  const trimmed = raw.trim();
  const looksLikeUrl = /^https?:\/\//i.test(trimmed) || /^[\w-]+\.[a-z]{2,}(\/|$)/i.test(trimmed);

  if (looksLikeUrl) {
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return { type: "url", url };
  }

  const [name, city] = trimmed.split(",").map((s) => s.trim());
  return { type: "name_city", name: name || trimmed, city: city || "" };
}

export function normalizeInput(raw: string): string {
  const classified = classifyInput(raw);
  if (classified.type === "url") {
    try {
      const u = new URL(classified.url);
      return `url:${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/$/, "")}`;
    } catch {
      return `url:${classified.url.toLowerCase()}`;
    }
  }
  return `nc:${classified.name.toLowerCase().trim()}|${classified.city.toLowerCase().trim()}`;
}

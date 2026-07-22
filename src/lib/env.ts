function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get GOOGLE_PLACES_API_KEY() {
    return required("GOOGLE_PLACES_API_KEY");
  },
  get PAGESPEED_API_KEY() {
    // PageSpeed Insights works with the same Google Cloud API key as Places,
    // but is kept separate in case the user scopes keys differently.
    return process.env.PAGESPEED_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";
  },
  get OPENAI_API_KEY() {
    return required("OPENAI_API_KEY");
  },
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get AI_VISIBILITY_MODEL() {
    return process.env.AI_VISIBILITY_MODEL || "gpt-4o-mini";
  },
  get SYNTHESIS_MODEL() {
    return process.env.SYNTHESIS_MODEL || "gpt-4o";
  },
  get PHOTO_QUALITY_MODEL() {
    return process.env.PHOTO_QUALITY_MODEL || "gpt-4o-mini";
  },
  get SERPER_API_KEY() {
    // Optional: enables the branded-name-search check via serper.dev (real
    // Google SERP results, proxied). Empty string means "not configured" —
    // the collector treats that as a clean skip, not an error, since this
    // feature is opt-in. Replaced Google's own Custom Search JSON API, which
    // stopped granting access to new projects/customers in 2026.
    return process.env.SERPER_API_KEY || "";
  },
  get CHAT_MODEL() {
    return process.env.CHAT_MODEL || "gpt-4o-mini";
  },
};

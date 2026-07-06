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
};

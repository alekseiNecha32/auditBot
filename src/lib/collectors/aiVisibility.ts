import OpenAI from "openai";
import { env } from "@/lib/env";
import type { AiVisibilityResult, AiVisibilityRun } from "@/lib/types";

const RUNS_PER_PROMPT = 3;
const CONCURRENCY = 5;
const MAX_RETRIES = 1;

function buildPrompts(category: string, city: string): string[] {
  const c = city || "the area";
  return [
    `best ${category} delivery in ${c}`,
    `where should I buy ${category} for a funeral in ${c}`,
    `best ${category} shop near me in ${c}`,
    `who has same day ${category} delivery in ${c}`,
    `best wedding ${category} in ${c}`,
    `cheap ${category} shops in ${c}`,
    `top rated ${category} shop in ${c}`,
    `recommend a local ${category} shop in ${c}`,
  ];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findMentions(response: string, businessNames: string[]): string[] {
  const normalizedResponse = normalize(response);
  return businessNames.filter((name) => {
    const normalizedName = normalize(name);
    if (!normalizedName) return false;
    return normalizedResponse.includes(normalizedName);
  });
}

async function withConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function runOnce(
  client: OpenAI,
  model: string,
  prompt: string,
  attempt = 0
): Promise<{ text: string | null; error: string | null }> {
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.8,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful local assistant answering a real customer's casual question, the way a friend familiar with the area would. " +
            "Give a direct, specific recommendation and name actual business names when you have an opinion, even if you're not fully certain. " +
            "Keep it conversational and under 100 words. If you genuinely have no idea, say so honestly instead of inventing a business.",
        },
        { role: "user", content: prompt },
      ],
    });
    const text = completion.choices[0]?.message?.content ?? null;
    return { text, error: null };
  } catch (err) {
    if (attempt < MAX_RETRIES) return runOnce(client, model, prompt, attempt + 1);
    return { text: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runAiVisibility(
  category: string,
  city: string,
  businessNames: string[]
): Promise<AiVisibilityResult> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = env.AI_VISIBILITY_MODEL;
  const prompts = buildPrompts(category, city);
  const errors: string[] = [];

  const jobs = prompts.flatMap((prompt) =>
    Array.from({ length: RUNS_PER_PROMPT }, (_, i) => ({ prompt, run: i + 1 }))
  );

  const raw: AiVisibilityRun[] = await withConcurrency(jobs, CONCURRENCY, async ({ prompt, run }) => {
    const { text, error } = await runOnce(client, model, prompt);
    if (error) errors.push(`"${prompt}" (run ${run}): ${error}`);
    const response = text ?? "";
    return {
      prompt,
      run,
      response,
      mentionedBusinesses: text ? findMentions(response, businessNames) : [],
    };
  });

  const mentionCounts: Record<string, number> = {};
  for (const name of businessNames) mentionCounts[name] = 0;
  for (const r of raw) {
    for (const name of r.mentionedBusinesses) {
      mentionCounts[name] = (mentionCounts[name] ?? 0) + 1;
    }
  }

  return {
    model,
    prompts,
    runsPerPrompt: RUNS_PER_PROMPT,
    raw,
    mentionCounts,
    totalRuns: jobs.length,
    errors,
  };
}

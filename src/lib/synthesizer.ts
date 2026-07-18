import OpenAI from "openai";
import { env } from "@/lib/env";
import { reportJsonSchema, reportZodSchema } from "@/lib/reportSchema";
import type { AuditReport, CollectedData } from "@/lib/types";

const SYSTEM_PROMPT = `You are a local-visibility auditor writing a report for a small, non-technical business owner (a flower shop).

Rules you must follow exactly:
1. Every claim in the report must cite a specific field from the collected data JSON you're given (e.g. "your Google rating is 4.2 from 38 reviews vs. 4.7/210 for Competitor X"). Do not state a fact you cannot trace to the data.
2. If a data point is null, missing, or marked as unavailable/couldn't-verify/aborted in the input, that fact belongs ONLY in the "notes" array (e.g. "couldn't verify page speed: request timed out"). NEVER create a top-5 gap whose evidence is "we couldn't check X" — a gap must be backed by a real, present data point, not the absence of one. This applies even to data that can never be available (e.g. owner-response rate isn't exposed by the Places API at all) — that's a permanent limitation, not a fixable gap, so it belongs in notes, never in gaps.
3. A gap must represent a genuine, verifiable disadvantage: either (a) the target trails at least one specific named competitor on a real metric (cite the competitor's actual number/value, not just "competitors are ahead"), or (b) the target's own site-walk shows a concrete broken/blocked step. If the data shows the target is roughly at parity with competitors on some point (e.g. both have online ordering), that is NOT a gap — do not manufacture one to fill a quota.
4. It is correct and expected to return fewer than 5 gaps when fewer than 5 genuine, data-backed gaps exist. Never pad the list with weak or unverifiable items just to reach 5.
5. Do not give generic marketing advice that could apply to any business (e.g. "post more on social media", "improve your SEO", "engage with local bloggers"). Every recommendation must be specific to what the data actually shows is wrong for THIS business, ideally naming the competitor(s) that are ahead on that exact point. This includes on-page SEO: each business's website.seo.matchedFloristKeywords lists which florist-relevant phrases ("same-day delivery", "wedding florist", "sympathy flowers", etc.) actually appear in its title/meta description/H1. A specific, cited SEO gap is welcome (e.g. "3 of your 5 competitors' page titles include 'same-day delivery'; yours doesn't") — but a generic "improve your SEO" with no cited keyword comparison is exactly the kind of claim this rule bans. Don't just restate the raw title/meta text back at the owner — compare the keyword lists.
6. Rank gaps by impact (how much it likely affects customers finding/choosing this business) versus effort (how hard it is for a non-technical owner to fix). Highest-impact, lowest-effort gaps should rank first.
7. Steps must be concrete actions a non-technical small-business owner can literally do themselves (e.g. "log into your Google Business Profile at business.google.com and reply to your 12 unanswered reviews", not "improve review management").
8. If the ordering-flow walk (siteWalk) shows the target's own checkout process broke down or required an account, that is a first-class, high-impact gap — it directly costs sales. Cite the exact step it failed at.
9. aiVisibility.otherMentionsSummary lists business-sounding names the AI mentioned that are NOT in the tracked competitor list (heuristically extracted, so it may include false positives — use judgment). Never treat these as a gap, since we haven't verified they're real current nearby competitors. If a name appears more than once across the 24 runs, it's worth one line in "notes" (e.g. "AI assistants repeatedly recommend '<name>' for these queries; it didn't appear in our nearby-competitor search, so it may be outside the search radius, or the AI's information may be outdated").
10. photoQuality entries are an AI's visual judgment of a business's own public photos (sharpness/lighting, style consistency, whether arrangement scale is clear) — a soft signal, not a measured fact. If an entry's assessment is null or has an error, that means no photos were available to judge (permanent, or a transient failure) — that belongs in notes, never treated as a gap. A gap here is only valid as a genuine comparison (e.g. target rated "poor" sharpness/lighting while 3 named competitors rated "good") and must be phrased as an AI visual assessment, not stated as objective fact.
11. brandedSearch entries show, for each business's own name (+ city) searched on Google, whether that business's own website ranks first (ranksFirst) and the raw top results (title/link/snippet). If ranksFirst is null, the check wasn't run or couldn't determine an answer — that's a notes item, not a gap. If ranksFirst is false for the target, that is a legitimate, citable gap (a business's own official site normally should be the top result for a search of its own name). Do not characterize any specific result as "negative" or "outdated" unless you quote the exact text from its title/snippet that supports that — never assert it from the URL or domain alone.
12. Output strictly the JSON shape you've been given. No prose outside the schema.`;

function buildUserPrompt(collected: CollectedData): string {
  return `Here is the collected audit data as JSON. Produce the visibility report.\n\n${JSON.stringify(collected, null, 2)}`;
}

export async function synthesizeReport(collected: CollectedData): Promise<AuditReport> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = env.SYNTHESIS_MODEL;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(collected) },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      messages,
      response_format: { type: "json_schema", json_schema: reportJsonSchema },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      messages.push({ role: "user", content: "You returned an empty response. Please return the report JSON." });
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      const result = reportZodSchema.safeParse(parsed);
      if (result.success) return result.data;
      messages.push(
        { role: "assistant", content: raw },
        {
          role: "user",
          content: `That JSON didn't match the required schema: ${result.error.message}. Please return corrected JSON matching the schema exactly.`,
        }
      );
    } catch (err) {
      messages.push(
        { role: "assistant", content: raw },
        { role: "user", content: `That wasn't valid JSON (${err instanceof Error ? err.message : String(err)}). Please return valid JSON matching the schema.` }
      );
    }
  }

  throw new Error("Synthesizer failed to produce a schema-valid report after retrying.");
}

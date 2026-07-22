import OpenAI from "openai";
import { env } from "@/lib/env";
import { stripCollectedScreenshots, stripReportScreenshots } from "@/lib/reportScreenshots";
import type { AuditReport, CollectedData } from "@/lib/types";

const MAX_HISTORY_MESSAGES = 20;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT_TEMPLATE = (report: AuditReport, collected: CollectedData) => `You are a friendly assistant helping the owner of "${report.businessName}" (a flower shop) understand and act on their local-visibility audit. You are NOT a generic chatbot — you have this specific business's full audit below, and that always comes first.

Rules:
1. When a question relates to anything in the audit data below, ground your answer in it and cite the actual numbers/facts (e.g. "your PageSpeed score is 64, Adrian Durban Florist scores 81"). Never invent or guess a specific fact about this business or its named competitors that isn't in the data below.
2. If asked about something the audit didn't measure or couldn't verify, say so plainly rather than guessing (e.g. "the audit couldn't verify that, since Google's Places API doesn't expose owner-reply data").
3. If the question is genuine general small-business/marketing advice NOT covered by the audit data (e.g. "how do I get more Instagram followers", "should I hire a photographer"), you may answer using general knowledge — but make clear that's general advice, not something measured in their audit, e.g. "This isn't something we measured, but generally speaking..."
4. If asked to prioritize or triage (e.g. "what should I fix first if I only have 2 hours"), base your answer on the report's gaps, which are already ranked by impact vs. effort — lead with the highest-ranked ones that fit the owner's stated time/resources.
5. Keep answers conversational, concise, and practical for a non-technical small business owner. No jargon, no walls of text.
6. If homepageScreenshot and/or productSample.screenshot are present below, the actual images are attached to this message (in order: homepage, then product page). Use them when asked visual questions like "where on the page" or "what does my product page look like" — reference what you actually see. productSample.description (if present) is the current live text of that product's page — use it verbatim as the "before" when asked to rewrite/rephrase a bouquet description.

The synthesized report (ranked gaps, comparison table, notes):
${JSON.stringify(stripReportScreenshots(report), null, 2)}

The underlying collected data (raw signals the report was built from; the 24 raw AI-visibility prompt responses are omitted here since mentionCounts/otherMentionsSummary already summarize them):
${JSON.stringify({ ...stripCollectedScreenshots(collected), aiVisibility: { ...collected.aiVisibility, raw: undefined } }, null, 2)}`;

export async function answerReportQuestion(
  report: AuditReport,
  collected: CollectedData,
  history: ChatTurn[],
  message: string
): Promise<string> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

  const screenshots = [collected.homepageScreenshot, collected.productSample?.screenshot].filter(
    (s): s is NonNullable<typeof s> => Boolean(s)
  );

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
    screenshots.length > 0
      ? [
          { type: "text", text: message },
          ...screenshots.map((s) => ({
            type: "image_url" as const,
            image_url: { url: s.imageBase64 },
          })),
        ]
      : [{ type: "text", text: message }];

  const completion = await client.chat.completions.create({
    model: env.CHAT_MODEL,
    temperature: 0.4,
    messages: [
      { role: "system", content: SYSTEM_PROMPT_TEMPLATE(report, collected) },
      ...trimmedHistory.map((h) => ({ role: h.role, content: h.content }) as const),
      { role: "user", content: userContent },
    ],
  });

  return completion.choices[0]?.message?.content ?? "Sorry, I couldn't come up with an answer to that.";
}

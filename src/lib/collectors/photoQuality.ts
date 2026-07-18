import OpenAI from "openai";
import { env } from "@/lib/env";
import { getPhotoUri } from "@/lib/collectors/places";
import type { BusinessProfile, PhotoQualityAssessment } from "@/lib/types";

const MAX_PHOTOS = 3;

const RESPONSE_SCHEMA = {
  name: "photo_quality_assessment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sharpnessAndLighting: { type: "string", enum: ["good", "fair", "poor"] },
      styleConsistency: { type: "string", enum: ["consistent", "inconsistent"] },
      arrangementScaleClear: { type: "boolean" },
      summary: { type: "string" },
    },
    required: ["sharpnessAndLighting", "styleConsistency", "arrangementScaleClear", "summary"],
  },
} as const;

function emptyAssessment(photosAssessed: number, error: string): PhotoQualityAssessment {
  return {
    photosAssessed,
    sharpnessAndLighting: null,
    styleConsistency: null,
    arrangementScaleClear: null,
    summary: null,
    error,
  };
}

// Best-effort visual judgment, not a verified measurement — reported as an
// "AI visual assessment" in the report, the same way AI-visibility mentions
// are framed, rather than as a hard fact like a Places rating.
export async function assessPhotoQuality(business: BusinessProfile): Promise<PhotoQualityAssessment | null> {
  const photoNames = business.photoNames.slice(0, MAX_PHOTOS);
  if (photoNames.length === 0) return null;

  const uris = (await Promise.all(photoNames.map((n) => getPhotoUri(n)))).filter((u): u is string => Boolean(u));
  if (uris.length === 0) {
    return emptyAssessment(0, "Couldn't retrieve photo URLs from the Places API.");
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = env.PHOTO_QUALITY_MODEL;

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are assessing product photos from a florist's Google Business Profile. Judge sharpness/lighting quality, " +
            "whether the photos share a consistent visual style, and whether the actual size/scale of the flower arrangements " +
            "is clear (e.g. shown next to a hand, table, vase, or other size reference). Be concise and specific in your summary.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Assess these photos:" },
            ...uris.map((uri) => ({ type: "image_url" as const, image_url: { url: uri } })),
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return emptyAssessment(uris.length, "Empty response from vision model.");

    const parsed = JSON.parse(raw);
    return {
      photosAssessed: uris.length,
      sharpnessAndLighting: parsed.sharpnessAndLighting ?? null,
      styleConsistency: parsed.styleConsistency ?? null,
      arrangementScaleClear: parsed.arrangementScaleClear ?? null,
      summary: parsed.summary ?? null,
      error: null,
    };
  } catch (err) {
    return emptyAssessment(uris.length, err instanceof Error ? err.message : String(err));
  }
}

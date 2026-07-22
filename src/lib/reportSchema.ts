import { z } from "zod";

export const reportZodSchema = z.object({
  generatedAt: z.string(),
  businessName: z.string(),
  city: z.string().nullable(),
  comparison: z.object({
    businesses: z.array(z.string()).min(1),
    rows: z
      .array(
        z.object({
          metric: z.string(),
          values: z.array(z.string()),
        })
      )
      .min(1),
  }),
  gaps: z
    .array(
      z.object({
        rank: z.number().int(),
        title: z.string(),
        impact: z.enum(["high", "medium", "low"]),
        effort: z.enum(["low", "medium", "high"]),
        evidence: z.string(),
        steps: z.array(z.string()).min(1),
      })
    )
    .min(1)
    .max(7),
  notes: z.array(z.string()),
});

// Plain JSON Schema mirror for OpenAI's response_format=json_schema (strict mode
// requires a hand-written schema rather than a zod-to-json-schema conversion,
// since the API rejects a few JSON-Schema constructs zod emits, e.g. `.min()`).
export const reportJsonSchema = {
  name: "visibility_report",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      generatedAt: { type: "string" },
      businessName: { type: "string" },
      city: { type: ["string", "null"] },
      comparison: {
        type: "object",
        additionalProperties: false,
        properties: {
          businesses: { type: "array", items: { type: "string" } },
          rows: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                metric: { type: "string" },
                values: { type: "array", items: { type: "string" } },
              },
              required: ["metric", "values"],
            },
          },
        },
        required: ["businesses", "rows"],
      },
      gaps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            rank: { type: "integer" },
            title: { type: "string" },
            impact: { type: "string", enum: ["high", "medium", "low"] },
            effort: { type: "string", enum: ["low", "medium", "high"] },
            evidence: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
          },
          required: ["rank", "title", "impact", "effort", "evidence", "steps"],
        },
      },
      notes: { type: "array", items: { type: "string" } },
    },
    required: ["generatedAt", "businessName", "city", "comparison", "gaps", "notes"],
  },
} as const;

import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import type { AuditReport, CollectedData, ReportRecord, ReportStatus, ResolvedInput } from "@/lib/types";

let initialized = false;

function sql() {
  return neon(env.DATABASE_URL);
}

async function ensureSchema() {
  if (initialized) return;
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS reports (
      slug TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      input JSONB NOT NULL,
      collected JSONB,
      report JSONB,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  initialized = true;
}

function toRecord(row: Record<string, unknown>): ReportRecord {
  return {
    slug: row.slug as string,
    status: row.status as ReportStatus,
    input: row.input as ResolvedInput,
    collected: (row.collected as CollectedData | null) ?? null,
    report: (row.report as AuditReport | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function createReport(slug: string, input: ResolvedInput): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO reports (slug, status, input)
    VALUES (${slug}, 'pending', ${JSON.stringify(input)}::jsonb)
  `;
}

export async function getReport(slug: string): Promise<ReportRecord | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT * FROM reports WHERE slug = ${slug}`;
  if (rows.length === 0) return null;
  return toRecord(rows[0] as Record<string, unknown>);
}

export async function updateReportStatus(slug: string, status: ReportStatus): Promise<void> {
  const db = sql();
  await db`UPDATE reports SET status = ${status}, updated_at = now() WHERE slug = ${slug}`;
}

export async function updateReportCollected(slug: string, collected: CollectedData): Promise<void> {
  const db = sql();
  await db`
    UPDATE reports
    SET collected = ${JSON.stringify(collected)}::jsonb, updated_at = now()
    WHERE slug = ${slug}
  `;
}

export async function completeReport(slug: string, report: AuditReport): Promise<void> {
  const db = sql();
  await db`
    UPDATE reports
    SET report = ${JSON.stringify(report)}::jsonb, status = 'complete', updated_at = now()
    WHERE slug = ${slug}
  `;
}

export async function failReport(slug: string, error: string): Promise<void> {
  const db = sql();
  await db`
    UPDATE reports
    SET status = 'error', error = ${error}, updated_at = now()
    WHERE slug = ${slug}
  `;
}

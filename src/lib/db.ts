import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
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
      normalized_input TEXT,
      requester_ip TEXT,
      collected JSONB,
      report JSONB,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS reports_normalized_input_idx ON reports (normalized_input, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS reports_requester_ip_idx ON reports (requester_ip, created_at DESC)`;
  await db`
    CREATE TABLE IF NOT EXISTS domain_verifications (
      domain TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT false,
      verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

export async function createReport(
  slug: string,
  input: ResolvedInput,
  normalizedInput: string,
  requesterIp: string
): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO reports (slug, status, input, normalized_input, requester_ip)
    VALUES (${slug}, 'pending', ${JSON.stringify(input)}::jsonb, ${normalizedInput}, ${requesterIp})
  `;
}

const RATE_LIMIT_PER_HOUR = 5;
const CACHE_HOURS = 24;

export async function countRecentReportsByIp(ip: string, hours = 1): Promise<number> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT COUNT(*)::int AS count FROM reports
    WHERE requester_ip = ${ip} AND created_at > now() - (${hours} * interval '1 hour')
  `;
  return (rows[0]?.count as number) ?? 0;
}

export async function isRateLimited(ip: string): Promise<boolean> {
  const count = await countRecentReportsByIp(ip, 1);
  return count >= RATE_LIMIT_PER_HOUR;
}

export async function findRecentReportByInput(normalizedInput: string): Promise<ReportRecord | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT * FROM reports
    WHERE normalized_input = ${normalizedInput}
      AND status IN ('complete', 'pending', 'resolving', 'collecting', 'synthesizing')
      AND created_at > now() - (${CACHE_HOURS} * interval '1 hour')
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return toRecord(rows[0] as Record<string, unknown>);
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

export interface DomainVerification {
  domain: string;
  token: string;
  verified: boolean;
  verifiedAt: string | null;
}

function toVerification(row: Record<string, unknown>): DomainVerification {
  return {
    domain: row.domain as string,
    token: row.token as string,
    verified: row.verified as boolean,
    verifiedAt: row.verified_at ? new Date(row.verified_at as string).toISOString() : null,
  };
}

// Returns the existing verification row for this domain, creating one with a
// fresh token if none exists yet. Idempotent: calling this repeatedly for the
// same unverified domain keeps returning the same token.
export async function ensureDomainVerification(domain: string): Promise<DomainVerification> {
  await ensureSchema();
  const db = sql();
  const existing = await db`SELECT * FROM domain_verifications WHERE domain = ${domain}`;
  if (existing.length > 0) return toVerification(existing[0] as Record<string, unknown>);

  const token = `abvb-${nanoid(24)}`;
  const rows = await db`
    INSERT INTO domain_verifications (domain, token)
    VALUES (${domain}, ${token})
    ON CONFLICT (domain) DO NOTHING
    RETURNING *
  `;
  if (rows.length > 0) return toVerification(rows[0] as Record<string, unknown>);
  // Lost a race to another concurrent request; fetch what they inserted.
  const row = await db`SELECT * FROM domain_verifications WHERE domain = ${domain}`;
  return toVerification(row[0] as Record<string, unknown>);
}

export async function markDomainVerified(domain: string): Promise<void> {
  const db = sql();
  await db`
    UPDATE domain_verifications
    SET verified = true, verified_at = now()
    WHERE domain = ${domain}
  `;
}

export async function isDomainVerified(domain: string): Promise<boolean> {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT verified FROM domain_verifications WHERE domain = ${domain}`;
  return rows.length > 0 && (rows[0].verified as boolean);
}

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { nanoid } from "nanoid";
import { classifyInput, normalizeInput } from "@/lib/classifyInput";
import { domainOf } from "@/lib/domain";
import { createReport, findRecentReportByInput, isDomainVerified, isRateLimited } from "@/lib/db";
import { runAuditPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  let body: { input?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const input = body.input?.trim();
  if (!input) {
    return NextResponse.json(
      { error: "Please provide a business URL, or \"Business Name, City\"." },
      { status: 400 }
    );
  }

  // ownsWebsite is never trusted from the client — it's derived here from a
  // domain that has actually passed the meta-tag verification check, so the
  // deep checkout-walk can only ever run against sites someone has proven
  // control of, not any URL a client claims to own.
  const classified = classifyInput(input);
  const domain = classified.type === "url" ? domainOf(classified.url) : null;
  const ownsWebsite = domain ? await isDomainVerified(domain) : false;

  const ip = getClientIp(req);
  const normalized = normalizeInput(input);

  const cached = await findRecentReportByInput(normalized);
  if (cached) {
    return NextResponse.json({ slug: cached.slug, reused: true });
  }

  if (await isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit reached (max 5 audits per hour from one location). Please try again later." },
      { status: 429 }
    );
  }

  const slug = nanoid(10);
  await createReport(slug, classified, normalized, ip);

  after(() => runAuditPipeline(slug, input, ownsWebsite));

  return NextResponse.json({ slug, reused: false });
}

import { NextRequest, NextResponse } from "next/server";
import { domainOf, VERIFY_META_TAG_NAME } from "@/lib/domain";
import { ensureDomainVerification } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const url = body.url?.trim();
  const domain = url ? domainOf(url) : null;
  if (!domain) {
    return NextResponse.json({ error: "Please provide a valid website URL." }, { status: 400 });
  }

  const verification = await ensureDomainVerification(domain);
  return NextResponse.json({
    domain: verification.domain,
    verified: verification.verified,
    metaTag: `<meta name="${VERIFY_META_TAG_NAME}" content="${verification.token}" />`,
  });
}

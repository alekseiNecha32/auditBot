import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { domainOf, VERIFY_META_TAG_NAME } from "@/lib/domain";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { ensureDomainVerification, markDomainVerified } from "@/lib/db";

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
  if (!url || !domain) {
    return NextResponse.json({ error: "Please provide a valid website URL." }, { status: 400 });
  }

  const verification = await ensureDomainVerification(domain);
  if (verification.verified) {
    return NextResponse.json({ domain, verified: true });
  }

  try {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const res = await fetchWithTimeout(target, { redirect: "follow" }, 12000);
    if (!res.ok) {
      return NextResponse.json({ domain, verified: false, error: `Couldn't fetch the homepage (HTTP ${res.status}).` });
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const found = $(`meta[name="${VERIFY_META_TAG_NAME}"]`).attr("content");

    if (found && found === verification.token) {
      await markDomainVerified(domain);
      return NextResponse.json({ domain, verified: true });
    }
    return NextResponse.json({
      domain,
      verified: false,
      error: "Meta tag not found on the homepage yet. Make sure it's saved and published, then try again.",
    });
  } catch (err) {
    return NextResponse.json({
      domain,
      verified: false,
      error: `Couldn't fetch the homepage: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

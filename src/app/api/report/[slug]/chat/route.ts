import { NextRequest, NextResponse } from "next/server";
import { getReport, isChatRateLimited, recordChatEvent } from "@/lib/db";
import { answerReportQuestion, type ChatTurn } from "@/lib/reportChat";

export const runtime = "nodejs";
export const maxDuration = 60;

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let body: { message?: string; history?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Please provide a message." }, { status: 400 });
  }

  const ip = getClientIp(req);
  if (await isChatRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit reached (max 30 messages per hour). Please try again later." },
      { status: 429 }
    );
  }

  const record = await getReport(slug);
  if (!record) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (record.status !== "complete" || !record.report || !record.collected) {
    return NextResponse.json({ error: "This report isn't ready yet." }, { status: 409 });
  }

  const history = Array.isArray(body.history) ? body.history : [];

  try {
    const reply = await answerReportQuestion(record.report, record.collected, history, message);
    await recordChatEvent(ip);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong answering that." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getReport } from "@/lib/db";
import { ReportDocument } from "@/lib/pdf/ReportDocument";

export const runtime = "nodejs";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "report";
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const record = await getReport(slug);

  if (!record || !record.report) {
    return NextResponse.json({ error: "Report not found or not ready yet." }, { status: 404 });
  }

  const buffer = await renderToBuffer(ReportDocument({ report: record.report }));
  const filename = `${slugify(record.report.businessName)}-visibility-audit.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

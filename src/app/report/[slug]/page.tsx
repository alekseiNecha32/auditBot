import { notFound } from "next/navigation";
import { getReport } from "@/lib/db";
import { ReportClient } from "./ReportClient";

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const record = await getReport(slug);

  if (!record) {
    notFound();
  }

  return <ReportClient slug={slug} initial={record} />;
}

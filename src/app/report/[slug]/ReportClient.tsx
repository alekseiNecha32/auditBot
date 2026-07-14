"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReportRecord, ReportStatus } from "@/lib/types";
import { ReportView } from "./ReportView";

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Queued…",
  resolving: "Finding your business on Google…",
  collecting: "Checking your Google listing, website, and AI visibility…",
  synthesizing: "Writing your report…",
  complete: "Done",
  error: "Something went wrong",
};

const STATUS_ORDER: ReportStatus[] = ["pending", "resolving", "collecting", "synthesizing", "complete"];

function ProgressSteps({ status }: { status: ReportStatus }) {
  const currentIndex = STATUS_ORDER.indexOf(status);
  return (
    <div className="space-y-2">
      {STATUS_ORDER.slice(0, -1).map((step, i) => {
        const done = currentIndex > i;
        const active = currentIndex === i;
        return (
          <div key={step} className="flex items-center gap-3 text-sm">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                done ? "bg-green-500" : active ? "bg-neutral-900 dark:bg-neutral-100 animate-pulse" : "bg-neutral-300 dark:bg-neutral-700"
              }`}
            />
            <span className={active ? "font-medium" : "text-neutral-500 dark:text-neutral-400"}>{STATUS_LABELS[step]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ReportClient({ slug, initial }: { slug: string; initial: ReportRecord }) {
  const [record, setRecord] = useState<ReportRecord>(initial);

  useEffect(() => {
    if (record.status === "complete" || record.status === "error") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/report/${slug}`);
        if (!res.ok) return;
        const data: ReportRecord = await res.json();
        setRecord(data);
      } catch {
        // transient network error; next poll tick will retry
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [slug, record.status]);

  if (record.status === "error") {
    return (
      <main className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="w-full max-w-lg space-y-4 text-center">
          <h1 className="text-xl font-semibold">Audit failed</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{record.error ?? "Unknown error."}</p>
          <Link href="/" className="inline-block text-sm underline">
            Try another audit
          </Link>
        </div>
      </main>
    );
  }

  if (record.status !== "complete" || !record.report) {
    return (
      <main className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold">Running your audit…</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              This checks your Google listing, website, and how AI assistants describe your business —
              usually takes 30-90 seconds.
            </p>
          </div>
          <ProgressSteps status={record.status} />
        </div>
      </main>
    );
  }

  return <ReportView slug={slug} report={record.report} collected={record.collected} />;
}

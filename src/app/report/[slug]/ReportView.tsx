import Link from "next/link";
import type { AuditReport, CollectedData } from "@/lib/types";

function ImpactBadge({ level }: { level: "high" | "medium" | "low" }) {
  const styles: Record<string, string> = {
    high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    low: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[level]}`}>{level} impact</span>;
}

function EffortBadge({ level }: { level: "high" | "medium" | "low" }) {
  const styles: Record<string, string> = {
    low: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    high: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[level]}`}>{level} effort</span>;
}

export function ReportView({
  slug,
  report,
  collected,
}: {
  slug: string;
  report: AuditReport;
  collected: CollectedData | null;
}) {
  return (
    <main className="flex-1 flex flex-col items-center px-6 py-12 sm:py-16">
      <div className="w-full max-w-3xl space-y-10">
        <header className="space-y-2">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            {report.businessName}
            {report.city ? <span className="text-neutral-500 dark:text-neutral-400"> — {report.city}</span> : null}
          </h1>
          <div className="flex flex-wrap gap-3 pt-1">
            <a
              href={`/api/report/${slug}/pdf`}
              className="text-sm rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Download PDF
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              className="text-sm rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Copy shareable link
            </button>
            <Link
              href="/"
              className="text-sm rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Start a new audit
            </Link>
          </div>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">How you compare</h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
                  <th className="text-left font-medium px-4 py-2 whitespace-nowrap">Metric</th>
                  {report.comparison.businesses.map((name, i) => (
                    <th key={name + i} className="text-left font-medium px-4 py-2 whitespace-nowrap">
                      {name}
                      {i === 0 && <span className="ml-1 text-xs text-neutral-400">(you)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.comparison.rows.map((row, i) => (
                  <tr key={row.metric + i} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                    <td className="px-4 py-2 font-medium whitespace-nowrap">{row.metric}</td>
                    {row.values.map((value, j) => (
                      <td key={j} className="px-4 py-2 text-neutral-700 dark:text-neutral-300">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Top {report.gaps.length} things to fix</h2>
          <ol className="space-y-4">
            {report.gaps
              .slice()
              .sort((a, b) => a.rank - b.rank)
              .map((gap) => (
                <li key={gap.rank} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium">
                      {gap.rank}. {gap.title}
                    </h3>
                    <div className="flex gap-2 shrink-0">
                      <ImpactBadge level={gap.impact} />
                      <EffortBadge level={gap.effort} />
                    </div>
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">{gap.evidence}</p>
                  <ol className="list-decimal list-inside text-sm space-y-1 pl-1">
                    {gap.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </li>
              ))}
          </ol>
        </section>

        {report.notes.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Notes</h2>
            <ul className="list-disc list-inside text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
              {report.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </section>
        )}

        {collected && (
          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-500 dark:text-neutral-400">
              Show underlying data collected for this audit
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-100 dark:bg-neutral-900 p-4 text-xs">
              {JSON.stringify(collected, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}

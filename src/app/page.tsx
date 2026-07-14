"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) || /^[\w-]+\.[a-z]{2,}(\/|$)/i.test(trimmed);
}

type VerifyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; domain: string; metaTag: string; verified: boolean }
  | { status: "checking"; domain: string; metaTag: string }
  | { status: "error"; message: string };

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  const isUrl = looksLikeUrl(input);

  async function startVerification() {
    setVerify({ status: "loading" });
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerify({ status: "error", message: data.error ?? "Couldn't start verification." });
        return;
      }
      setVerify({ status: "ready", domain: data.domain, metaTag: data.metaTag, verified: data.verified });
    } catch (err) {
      setVerify({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function checkVerification(domain: string, metaTag: string) {
    setVerify({ status: "checking", domain, metaTag });
    try {
      const res = await fetch("/api/verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input.trim() }),
      });
      const data = await res.json();
      if (data.verified) {
        setVerify({ status: "ready", domain, metaTag, verified: true });
      } else {
        setVerify({ status: "error", message: data.error ?? "Not verified yet." });
      }
    } catch (err) {
      setVerify({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!input.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong starting the audit.");
        setSubmitting(false);
        return;
      }
      router.push(`/report/${data.slug}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-xl space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Local Visibility Audit</h1>
          <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400">
            Paste your flower shop&apos;s website (or type &quot;Business Name, City&quot;) to see exactly how
            you compare to nearby competitors on Google, your website, and AI assistants — with ranked,
            concrete fixes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setVerify({ status: "idle" });
            }}
            placeholder="https://yourflowershop.com or Blossom Florist, Austin"
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:ring-neutral-400"
          />

          {isUrl && (
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
              <p className="text-sm font-medium">Full ordering-flow audit (optional)</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Own this site? Verify it to unlock the deep checkout-flow test (does your cart/checkout
                actually work, on mobile and desktop). Without verification, we&apos;ll still run every
                public check (Google listing, PageSpeed, SSL, AI visibility) — just not the interactive
                checkout walk.
              </p>

              {verify.status === "idle" && (
                <button
                  type="button"
                  onClick={startVerification}
                  className="text-sm rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Verify site ownership
                </button>
              )}

              {verify.status === "loading" && <p className="text-xs text-neutral-500">Loading…</p>}

              {(verify.status === "checking" || (verify.status === "ready" && !verify.verified)) && (
                <div className="space-y-2">
                  <p className="text-xs">
                    Add this tag to your homepage&apos;s <code>&lt;head&gt;</code> (most site builders have a
                    &quot;custom code&quot; or &quot;header scripts&quot; field for this):
                  </p>
                  <div className="flex items-stretch gap-2">
                    <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-neutral-100 dark:bg-neutral-900 px-3 py-2 text-xs">
                      {verify.metaTag}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(verify.metaTag);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className="shrink-0 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={verify.status === "checking"}
                    onClick={() => checkVerification(verify.domain, verify.metaTag)}
                    className="text-sm rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {verify.status === "checking" ? "Checking…" : "I've added it — check now"}
                  </button>
                </div>
              )}

              {verify.status === "ready" && verify.verified && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  ✓ Ownership verified for {verify.domain}. The full ordering-flow audit will run.
                </p>
              )}

              {verify.status === "error" && (
                <div className="space-y-2">
                  <p className="text-xs text-red-600 dark:text-red-400">{verify.message}</p>
                  <button
                    type="button"
                    onClick={startVerification}
                    className="text-sm rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !input.trim()}
            className="w-full rounded-lg bg-neutral-900 dark:bg-neutral-100 text-neutral-50 dark:text-neutral-900 px-4 py-3 font-medium disabled:opacity-50"
          >
            {submitting ? "Starting audit…" : "Run Audit"}
          </button>

          {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}
        </form>

        <p className="text-xs text-center text-neutral-400 dark:text-neutral-600">
          No account needed. Every claim in your report is tied to real, cited data — if something can&apos;t
          be verified, we say so instead of guessing.
        </p>
      </div>
    </main>
  );
}

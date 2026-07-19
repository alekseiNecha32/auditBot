"use client";

import { useState } from "react";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export function ReportChat({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;

    setError(null);
    setInput("");
    const nextMessages: ChatTurn[] = [...messages, { role: "user", content: message }];
    setMessages(nextMessages);
    setSending(true);

    try {
      const res = await fetch(`/api/report/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: messages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Ask about your audit</h2>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Ask anything about this report — e.g. &quot;why does my PageSpeed score matter?&quot; or &quot;what should I
        fix first if I only have 2 hours?&quot;
      </p>

      {messages.length > 0 && (
        <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 max-h-96 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900"
                    : "bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
                }`}
              >
                {m.content}
              </span>
            </div>
          ))}
          {sending && <p className="text-sm text-neutral-400">Thinking…</p>}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask a question about your audit…"
          className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-400"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !input.trim()}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 text-neutral-50 dark:text-neutral-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}

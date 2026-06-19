"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

type Status = "idle" | "sending" | "sent" | "error";

export function CreatorFeedbackForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = message.trim();
    if (body.length < 10) {
      setStatus("error");
      setErrorMsg("Please write at least 10 characters.");
      return;
    }

    setStatus("sending");
    setErrorMsg("");

    try {
      const res = await fetch("/api/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          message: body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data?.error?.message ?? "Could not send your message. Try again later.");
        return;
      }
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Check your connection and try again.");
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
        Send a message to the creator
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Share feedback, report a data issue, or suggest an improvement. Your message goes directly
        to the person maintaining Board Analytics PH.
      </p>

      {status === "sent" ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Thank you — your message was sent successfully.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-500">
              Name <span className="text-slate-400">(optional)</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="field-input mt-1 w-full"
                autoComplete="name"
              />
            </label>
            <label className="block text-xs text-slate-500">
              Email <span className="text-slate-400">(optional)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                className="field-input mt-1 w-full"
                autoComplete="email"
              />
            </label>
          </div>
          <label className="block text-xs text-slate-500">
            Message
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={10}
              maxLength={4000}
              rows={5}
              placeholder="Tell us what helped, what confused you, or what we should add next…"
              className="field-input mt-1 w-full resize-y"
            />
          </label>
          {status === "error" && errorMsg && (
            <p className="text-sm text-rose-700">{errorMsg}</p>
          )}
          <button
            type="submit"
            disabled={status === "sending"}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {status === "sending" ? "Sending…" : "Send message"}
          </button>
        </form>
      )}
    </Card>
  );
}

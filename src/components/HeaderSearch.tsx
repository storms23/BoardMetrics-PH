"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search exams…"
        className="field-input min-w-0 flex-1 py-1.5 text-sm sm:w-40 lg:w-52"
        aria-label="Search exams"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        Search
      </button>
    </form>
  );
}

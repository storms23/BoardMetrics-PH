"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <form onSubmit={submit} className="flex min-w-0 gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search exams…"
        className="field-input min-w-0 flex-1 px-3 py-2.5 sm:px-4 sm:py-3"
        aria-label="Search"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark sm:px-5 sm:py-3"
      >
        Search
      </button>
    </form>
  );
}

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
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search exams…"
        className="field-input w-full px-4 py-3"
        aria-label="Search"
      />
      <button
        type="submit"
        className="rounded-lg bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark"
      >
        Search
      </button>
    </form>
  );
}

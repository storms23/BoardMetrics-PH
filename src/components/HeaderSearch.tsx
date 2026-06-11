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
    <form onSubmit={submit} className="hidden items-center gap-2 sm:flex">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search schools…"
        className="field-input w-44 py-1.5 text-sm lg:w-56"
        aria-label="Search schools"
      />
      <button
        type="submit"
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        Search
      </button>
    </form>
  );
}

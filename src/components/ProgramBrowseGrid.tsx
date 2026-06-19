"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  PROGRAMS,
  PROGRAM_CATEGORY_LABELS,
  PROGRAM_CATEGORY_ORDER,
  type Program,
  type ProgramCategory,
} from "@/lib/programs";
import { ExamBrowseCard } from "@/components/ExamBrowseCard";

type Filter = "all" | ProgramCategory;

function sortPrograms(list: Program[]): Program[] {
  const order = new Map(PROGRAM_CATEGORY_ORDER.map((c, i) => [c, i]));
  return [...list].sort(
    (a, b) =>
      (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
      a.name.localeCompare(b.name),
  );
}

function CategoryFilter({
  active,
  onChange,
}: {
  active: Filter;
  onChange: (filter: Filter) => void;
}) {
  const pills: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    ...PROGRAM_CATEGORY_ORDER.map((id) => ({
      id,
      label: PROGRAM_CATEGORY_LABELS[id],
    })),
  ];

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by field">
      {pills.map(({ id, label }) => {
        const selected = active === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              selected
                ? "border-brand bg-brand text-white"
                : "border-ink-line bg-white text-slate-600 hover:border-brand hover:text-brand"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ProgramBrowseGrid({
  title = "Browse by examination",
  subtitle,
  showHeaderLink = true,
}: {
  title?: string;
  subtitle?: string;
  showHeaderLink?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const list =
      filter === "all" ? PROGRAMS : PROGRAMS.filter((p) => p.category === filter);
    return sortPrograms(list);
  }, [filter]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {subtitle ?? `${PROGRAMS.length} programs · filter by field or browse all`}
          </p>
        </div>
        {showHeaderLink && (
          <Link href="/exams" className="text-xs text-brand hover:underline">
            Full exam list →
          </Link>
        )}
      </div>

      <CategoryFilter active={filter} onChange={setFilter} />

      <p className="text-xs text-slate-500">
        Showing {visible.length} of {PROGRAMS.length} programs
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <ExamBrowseCard key={p.examCode} program={p} />
        ))}
      </div>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, DataStatusBadge } from "@/components/ui";
import {
  PROGRAMS,
  PROGRAM_CATEGORY_LABELS,
  PROGRAM_CATEGORY_ORDER,
  type Program,
  type ProgramCategory,
} from "@/lib/programs";
import { ProgramIcon } from "@/components/ProgramIcon";

export type ProgramExamStats = {
  complete_cycles: number;
  total_cycles: number;
  avg_national_pass_rate: number | null;
  earliest_year: number | null;
  latest_year: number | null;
};

type Filter = "all" | ProgramCategory;

function shortName(name: string): string {
  return name.replace(" Licensure Examination", "");
}

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

export function ExamProgramGrid({
  stats,
}: {
  stats: Record<string, ProgramExamStats | undefined>;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const list =
      filter === "all" ? PROGRAMS : PROGRAMS.filter((p) => p.category === filter);
    return sortPrograms(list);
  }, [filter]);

  return (
    <div className="space-y-4">
      <CategoryFilter active={filter} onChange={setFilter} />

      <p className="text-xs text-slate-500">
        Showing {visible.length} of {PROGRAMS.length} programs
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => {
          const s = stats[p.examCode];
          const status =
            !s || s.complete_cycles === 0
              ? "none"
              : s.complete_cycles < s.total_cycles
                ? "partial"
                : "ok";

          return (
            <Link key={p.examCode} href={`/exams/${p.slug}`}>
              <Card className="h-full transition-colors hover:border-brand">
                <div className="flex gap-3">
                  <ProgramIcon iconKey={p.iconKey} category={p.category} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="font-semibold text-slate-900">{shortName(p.name)}</div>
                      <DataStatusBadge status={status} />
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-500">{p.examCode}</div>
                    <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {PROGRAM_CATEGORY_LABELS[p.category]}
                    </div>
                    {s && s.complete_cycles > 0 ? (
                      <div className="mt-3 text-xs text-slate-600">
                        Avg pass rate:{" "}
                        <span className="font-semibold text-brand">
                          {s.avg_national_pass_rate}%
                        </span>
                        <br />
                        {s.complete_cycles} cycle{s.complete_cycles === 1 ? "" : "s"}
                        {s.earliest_year != null && s.latest_year != null && (
                          <> · {s.earliest_year}–{s.latest_year}</>
                        )}
                      </div>
                    ) : s && s.total_cycles > 0 ? (
                      <p className="mt-3 text-xs text-amber-700">
                        {s.total_cycles} cycle{s.total_cycles === 1 ? "" : "s"} ingested — national
                        stats pending backfill.
                      </p>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">Not yet ingested.</p>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

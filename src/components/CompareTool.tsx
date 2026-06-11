"use client";

import { useEffect, useState, useCallback } from "react";

interface CompareEntry {
  school_id: number;
  summary: {
    avg_pass_rate: number | null;
    consistency_score: number | null;
    consistency_label: string;
    times_above_national: number;
    best_pass_rate: number | null;
    worst_pass_rate: number | null;
    exams_participated: number;
  };
  history: any[];
}

const METRICS: { key: string; label: string; fmt?: (v: any) => string }[] = [
  { key: "avg_pass_rate", label: "Avg Pass Rate", fmt: (v) => (v != null ? `${v}%` : "—") },
  { key: "best_pass_rate", label: "Best Pass Rate", fmt: (v) => (v != null ? `${v}%` : "—") },
  { key: "worst_pass_rate", label: "Worst Pass Rate", fmt: (v) => (v != null ? `${v}%` : "—") },
  { key: "consistency_score", label: "Consistency Score", fmt: (v) => (v != null ? `${v}/100` : "—") },
  { key: "consistency_label", label: "Consistency Rating" },
  { key: "times_above_national", label: "Times Above National", fmt: (v) => `${v}x` },
  { key: "exams_participated", label: "Exams Tracked" },
];

export function CompareTool({ initialIds }: { initialIds: number[] }) {
  const [ids, setIds] = useState<number[]>(initialIds);
  const [data, setData] = useState<Record<string, CompareEntry>>({});
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (ids.length === 0) {
      setData({});
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/compare?school_ids=${ids.join(",")}`);
      setData(res.ok ? await res.json() : {});
    } catch {
      setData({});
    } finally {
      setLoading(false);
    }
  }, [ids]);

  useEffect(() => {
    void load();
  }, [load]);

  async function search(q: string) {
    setTerm(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`);
      const json = res.ok ? await res.json() : { schools: [] };
      setResults(json.schools ?? []);
    } catch {
      setResults([]);
    }
  }

  function addSchool(id: number) {
    if (!ids.includes(id)) setIds([...ids, id]);
    setTerm("");
    setResults([]);
  }

  function removeSchool(id: number) {
    setIds(ids.filter((x) => x !== id));
  }

  const names = Object.keys(data);

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <input
          value={term}
          onChange={(e) => search(e.target.value)}
          placeholder="Add a school to compare…"
          className="field-input w-full px-4 py-3"
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-ink-line bg-white shadow-lg">
            {results.map((s) => (
              <button
                key={s.id}
                onClick={() => addSchool(s.id)}
                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {s.name}
                {s.regions?.name && (
                  <span className="ml-2 text-xs text-slate-500">{s.regions.name}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {names.length === 0 ? (
        <div className="rounded-xl border border-ink-line bg-ink-soft p-5 text-slate-600 shadow-sm">
          Search and add schools to compare them side-by-side.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-line bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-line bg-slate-50 text-left">
              <tr>
                <th className="p-3 text-slate-500">Metric</th>
                {names.map((name) => (
                  <th key={name} className="p-3 text-slate-900">
                    <div className="flex items-center justify-between gap-2">
                      <span>{name}</span>
                      <button
                        onClick={() => removeSchool(data[name].school_id)}
                        className="text-xs text-rose-600 hover:text-rose-700"
                        aria-label={`Remove ${name}`}
                      >
                        ✕
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key} className="border-b border-ink-line/80 hover:bg-slate-50">
                  <td className="p-3 text-slate-500">{m.label}</td>
                  {names.map((name) => {
                    const v = (data[name].summary as any)[m.key];
                    return (
                      <td key={name} className="p-3 text-slate-700">
                        {m.fmt ? m.fmt(v) : String(v ?? "—")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

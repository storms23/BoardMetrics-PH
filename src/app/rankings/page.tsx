import Link from "next/link";
import { Card, SectionTitle, NotConnected, PassRate, SchoolLink } from "@/components/ui";
import { ExportButton } from "@/components/ExportButton";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getRankings, getAggregateRankings } from "@/lib/queries";
import { PROGRAMS } from "@/lib/programs";

export const metadata = { title: "Rankings" };
export const dynamic = "force-dynamic";

const REGIONS = [
  "NCR", "CAR", "Region I", "Region II", "Region III", "Region IV-A",
  "Region IV-B", "Region V", "Region VI", "Region VII", "Region VIII",
  "Region IX", "Region X", "Region XI", "Region XII", "Region XIII", "BARMM",
];

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const examCode = sp.exam_code || PROGRAMS[3].examCode;
  const year = sp.year ? Number(sp.year) : undefined;
  const region = sp.region || undefined;
  const minTakers = sp.min_takers ? Number(sp.min_takers) : undefined;

  // If no year is selected → multi-year aggregate rankings
  // If a year is selected → single-cycle rankings for that year
  const isAggregate = !year;

  let rankings: any[] = [];
  let connected = isSupabaseConfigured();
  if (connected) {
    try {
      if (isAggregate) {
        rankings = await getAggregateRankings({ examCode, region, minTakers, limit: 100 });
      } else {
        rankings = await getRankings({ examCode, year, region, minTakers, limit: 100 });
      }
    } catch {
      connected = false;
    }
  }

  const exportQuery = new URLSearchParams({
    type: "rankings",
    exam_code: examCode,
    ...(year ? { year: String(year) } : {}),
    ...(region ? { region } : {}),
    ...(minTakers ? { min_takers: String(minTakers) } : {}),
  });

  const programName =
    PROGRAMS.find((p) => p.examCode === examCode)?.name.replace(" Licensure Examination", "") ?? examCode;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Rankings</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isAggregate
              ? `${programName} — all-time average pass rate across all available years`
              : `${programName} — single-year results for ${year}`}
          </p>
        </div>
        {connected && rankings.length > 0 && <ExportButton query={exportQuery.toString()} />}
      </div>

      {/* Filters */}
      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-slate-400">
            Examination
            <select
              name="exam_code"
              defaultValue={examCode}
              className="mt-1 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-white"
            >
              {PROGRAMS.map((p) => (
                <option key={p.examCode} value={p.examCode}>
                  {p.examCode} — {p.name.replace(" Licensure Examination", "")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Year{" "}
            <span className="text-slate-500">(leave blank for all-time average)</span>
            <input
              name="year"
              type="number"
              defaultValue={year ?? ""}
              placeholder="e.g. 2024"
              className="mt-1 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-white"
            />
          </label>
          <label className="text-xs text-slate-400">
            Region
            <select
              name="region"
              defaultValue={region ?? ""}
              className="mt-1 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-white"
            >
              <option value="">All regions</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Min examinees
            <input
              name="min_takers"
              type="number"
              defaultValue={minTakers ?? ""}
              placeholder="e.g. 50"
              className="mt-1 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-white"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
            >
              Apply filters
            </button>
          </div>
        </form>
      </Card>

      {!connected ? (
        <NotConnected />
      ) : rankings.length === 0 ? (
        <Card>
          <p className="text-slate-400">No data found for the selected filters.</p>
          {year && (
            <p className="mt-2 text-sm text-slate-500">
              Try removing the year filter to see the all-time aggregate ranking.
            </p>
          )}
        </Card>
      ) : isAggregate ? (
        /* ── Multi-year aggregate table ── */
        <Card className="overflow-x-auto p-0">
          <div className="border-b border-ink-line px-4 py-2 text-xs text-slate-500">
            Ranked by average pass rate · Schools with at least 1 exam cycle shown
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-ink-line text-left text-slate-400">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">School</th>
                <th className="p-3">Region</th>
                <th className="p-3 text-right">Avg Pass Rate</th>
                <th className="p-3 text-right">Best</th>
                <th className="p-3 text-right">Worst</th>
                <th className="p-3 text-right">Years</th>
                <th className="p-3 text-right">Total Takers</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r) => (
                <tr key={r.school_id} className="border-b border-ink-line/50 hover:bg-white/5">
                  <td className="p-3 font-semibold text-slate-400">{r.rank}</td>
                  <td className="p-3">
                    <SchoolLink id={r.school_id} name={r.school} />
                  </td>
                  <td className="p-3 text-slate-400">{r.region ?? "—"}</td>
                  <td className="p-3 text-right font-semibold">
                    <PassRate value={r.avg_pass_rate} />
                  </td>
                  <td className="p-3 text-right text-emerald-400">{r.best_pass_rate}%</td>
                  <td className="p-3 text-right text-rose-400">{r.worst_pass_rate}%</td>
                  <td className="p-3 text-right text-slate-300">{r.years_participated}</td>
                  <td className="p-3 text-right text-slate-400">
                    {r.total_takers?.toLocaleString() ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        /* ── Single-year table ── */
        <Card className="overflow-x-auto p-0">
          <div className="border-b border-ink-line px-4 py-2 text-xs text-slate-500">
            Showing results for {year} · Rank is from PRC official results
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-ink-line text-left text-slate-400">
              <tr>
                <th className="p-3">PRC Rank</th>
                <th className="p-3">School</th>
                <th className="p-3">Region</th>
                <th className="p-3 text-right">Examinees</th>
                <th className="p-3 text-right">Passers</th>
                <th className="p-3 text-right">Pass Rate</th>
                <th className="p-3 text-right">National Rate</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r) => (
                <tr
                  key={`${r.school_id}-${r.year}-${r.month}`}
                  className="border-b border-ink-line/50 hover:bg-white/5"
                >
                  <td className="p-3 text-slate-500">{r.rank ?? "—"}</td>
                  <td className="p-3">
                    <SchoolLink id={r.school_id} name={r.school} />
                  </td>
                  <td className="p-3 text-slate-400">{r.region ?? "—"}</td>
                  <td className="p-3 text-right">{r.takers?.toLocaleString() ?? "—"}</td>
                  <td className="p-3 text-right">{r.passers?.toLocaleString() ?? "—"}</td>
                  <td className="p-3 text-right">
                    <PassRate value={r.pass_rate} />
                  </td>
                  <td className="p-3 text-right text-slate-400">
                    {r.national_rate != null ? `${r.national_rate}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

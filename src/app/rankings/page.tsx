import Link from "next/link";
import { Card, SectionTitle, NotConnected, PassRate, SchoolLink } from "@/components/ui";
import { SearchBar } from "@/components/SearchBar";
import { ExportButton } from "@/components/ExportButton";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getRankings, getAggregateRankings } from "@/lib/queries";
import { PROGRAMS } from "@/lib/programs";

export const metadata = { title: "Rankings" };
export const dynamic = "force-dynamic";

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const examCode = sp.exam_code || PROGRAMS[3].examCode;
  const year = sp.year ? Number(sp.year) : undefined;
  const month = sp.month?.trim() || undefined;
  const school = sp.school?.trim() || undefined;
  const minTakers = sp.min_takers ? Number(sp.min_takers) : undefined;

  // If no year is selected → multi-year aggregate rankings
  // If a year is selected → single-cycle rankings for that year
  const isAggregate = !year;

  let rankings: any[] = [];
  let connected = isSupabaseConfigured();
  if (connected) {
    try {
      if (isAggregate) {
        rankings = await getAggregateRankings({ examCode, school, minTakers, limit: 1000 });
      } else {
        rankings = await getRankings({ examCode, year, month, school, minTakers, limit: 1000 });
      }
    } catch {
      connected = false;
    }
  }

  const exportQuery = new URLSearchParams({
    type: "rankings",
    exam_code: examCode,
    ...(year ? { year: String(year) } : {}),
    ...(month ? { month } : {}),
    ...(minTakers ? { min_takers: String(minTakers) } : {}),
    ...(school ? { school } : {}),
  });

  const programName =
    PROGRAMS.find((p) => p.examCode === examCode)?.name.replace(" Licensure Examination", "") ?? examCode;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Rankings</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isAggregate
              ? `${programName} — all-time pass rate (one row per school, all years combined)`
              : month
                ? `${programName} — ${month} ${year}`
                : `${programName} — all cycles in ${year} (pick a month for one exam sitting)`}
          </p>
        </div>
        {connected && rankings.length > 0 && <ExportButton query={exportQuery.toString()} />}
      </div>

      <div className="max-w-xl">
        <SearchBar />
        <p className="mt-1 text-xs text-slate-500">
          Global school search — or filter this table with the school field below.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-slate-500">
            Examination
            <select
              name="exam_code"
              defaultValue={examCode}
              className="field-input mt-1 w-full"
            >
              {PROGRAMS.map((p) => (
                <option key={p.examCode} value={p.examCode}>
                  {p.examCode} — {p.name.replace(" Licensure Examination", "")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Year{" "}
            <span className="text-slate-400">(blank = all-time)</span>
            <input
              name="year"
              type="number"
              defaultValue={year ?? ""}
              placeholder="e.g. 2017"
              className="field-input mt-1 w-full"
            />
          </label>
          <label className="text-xs text-slate-500">
            Month{" "}
            <span className="text-slate-400">(one exam cycle)</span>
            <select
              name="month"
              defaultValue={month ?? ""}
              className="field-input mt-1 w-full"
            >
              <option value="">All cycles in year</option>
              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            School name
            <input
              name="school"
              type="search"
              defaultValue={school ?? ""}
              placeholder="e.g. valenzuela, PLV"
              className="field-input mt-1 w-full"
            />
          </label>
          <label className="text-xs text-slate-500">
            Min examinees
            <input
              name="min_takers"
              type="number"
              defaultValue={minTakers ?? ""}
              placeholder="e.g. 50"
              className="field-input mt-1 w-full"
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
          <p className="text-slate-600">No data found for the selected filters.</p>
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
            {rankings.length} schools · ranked by pass rate (passers ÷ examinees) across all years
          </div>
          <table className="data-table w-full text-sm">
            <thead className="border-b border-ink-line bg-slate-100 text-left text-slate-700">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">School</th>
                <th className="p-3 text-right">Avg Pass Rate</th>
                <th className="p-3 text-right">Best</th>
                <th className="p-3 text-right">Worst</th>
                <th className="p-3 text-right">Years</th>
                <th className="p-3 text-right">Total Takers</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r) => (
                <tr key={r.school_id} className="border-b border-ink-line/80">
                  <td className="p-3 font-semibold text-slate-500">{r.rank}</td>
                  <td className="p-3">
                    <SchoolLink id={r.school_id} name={r.school} />
                  </td>
                  <td className="p-3 text-right font-semibold">
                    <PassRate value={r.avg_pass_rate} />
                  </td>
                  <td className="p-3 text-right text-emerald-600">{r.best_pass_rate}%</td>
                  <td className="p-3 text-right text-rose-600">{r.worst_pass_rate}%</td>
                  <td className="p-3 text-right text-slate-700">{r.years_participated}</td>
                  <td className="p-3 text-right text-slate-600">
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
            {rankings.length} schools
            {month ? ` · ${month} ${year}` : ` · all cycles in ${year}`}
            {" "}· full PRC Performance of Schools table
          </div>
          <table className="data-table w-full text-sm">
            <thead className="border-b border-ink-line bg-slate-100 text-left text-slate-700">
              <tr>
                <th className="p-3">PRC Rank</th>
                <th className="p-3">School</th>
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
                  className="border-b border-ink-line/80"
                >
                  <td className="p-3 text-slate-500">{r.rank ?? "—"}</td>
                  <td className="p-3">
                    <SchoolLink id={r.school_id} name={r.school} />
                  </td>
                  <td className="p-3 text-right">{r.takers?.toLocaleString() ?? "—"}</td>
                  <td className="p-3 text-right">{r.passers?.toLocaleString() ?? "—"}</td>
                  <td className="p-3 text-right">
                    <PassRate value={r.pass_rate} />
                  </td>
                  <td className="p-3 text-right text-slate-600">
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

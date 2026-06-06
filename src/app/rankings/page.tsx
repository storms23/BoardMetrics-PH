import Link from "next/link";
import { Card, SectionTitle, NotConnected, PassRate, SchoolLink } from "@/components/ui";
import { ExportButton } from "@/components/ExportButton";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getRankings } from "@/lib/queries";
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
  const examCode = sp.exam_code || PROGRAMS[3].examCode; // default NLE
  const year = sp.year ? Number(sp.year) : undefined;
  const region = sp.region || undefined;
  const minTakers = sp.min_takers ? Number(sp.min_takers) : undefined;

  let rankings: any[] = [];
  let connected = isSupabaseConfigured();
  if (connected) {
    try {
      rankings = await getRankings({ examCode, year, region, minTakers, limit: 100 });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold text-white">Rankings portal</h1>
        {connected && rankings.length > 0 && <ExportButton query={exportQuery.toString()} />}
      </div>

      {/* SSR filter form (no client JS needed) */}
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
            Year
            <input
              name="year"
              type="number"
              defaultValue={year ?? ""}
              placeholder="e.g. 2025"
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
        <Card>No rankings found for the selected filters.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-line text-left text-slate-400">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">School</th>
                <th className="p-3">Region</th>
                <th className="p-3 text-right">Examinees</th>
                <th className="p-3 text-right">Passers</th>
                <th className="p-3 text-right">Pass Rate</th>
                <th className="p-3 text-right">Year</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r) => (
                <tr key={`${r.school_id}-${r.year}-${r.month}`} className="border-b border-ink-line/50">
                  <td className="p-3 text-slate-500">{r.rank}</td>
                  <td className="p-3">
                    <SchoolLink id={r.school_id} name={r.school} />
                  </td>
                  <td className="p-3 text-slate-400">{r.region ?? "—"}</td>
                  <td className="p-3 text-right">{r.takers ?? "—"}</td>
                  <td className="p-3 text-right">{r.passers ?? "—"}</td>
                  <td className="p-3 text-right">
                    <PassRate value={r.pass_rate} />
                  </td>
                  <td className="p-3 text-right text-slate-400">
                    {r.month ? `${r.month} ` : ""}
                    {r.year}
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

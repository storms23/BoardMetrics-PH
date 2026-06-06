import { Card, SectionTitle, NotConnected, PassRate } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { regionalAnalytics } from "@/lib/queries";
import { PROGRAMS } from "@/lib/programs";
import Link from "next/link";

export const metadata = { title: "Regional Analytics" };
export const dynamic = "force-dynamic";

export default async function RegionsPage({
  searchParams,
}: {
  searchParams: Promise<{ exam_code?: string }>;
}) {
  const { exam_code } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-white">Regional analytics</h1>
        <NotConnected />
      </div>
    );
  }

  let rows: any[] = [];
  try {
    rows = await regionalAnalytics(exam_code);
  } catch {
    return <NotConnected />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-white">Regional analytics</h1>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href="/regions"
          className={`rounded-full border px-3 py-1 ${
            !exam_code ? "border-brand bg-brand/20 text-white" : "border-ink-line text-slate-400"
          }`}
        >
          All exams
        </Link>
        {PROGRAMS.map((p) => (
          <Link
            key={p.examCode}
            href={`/regions?exam_code=${p.examCode}`}
            className={`rounded-full border px-3 py-1 ${
              exam_code === p.examCode
                ? "border-brand bg-brand/20 text-white"
                : "border-ink-line text-slate-400"
            }`}
          >
            {p.examCode}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>No regional data yet.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-line text-left text-slate-400">
              <tr>
                <th className="p-3">Region</th>
                <th className="p-3 text-right">Schools</th>
                <th className="p-3 text-right">Avg Pass Rate</th>
                <th className="p-3 text-right">Total Passers</th>
                <th className="p-3 text-right">Total Examinees</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.region} className="border-b border-ink-line/50">
                  <td className="p-3 text-white">{r.region}</td>
                  <td className="p-3 text-right">{r.schools}</td>
                  <td className="p-3 text-right">
                    <PassRate value={r.avg_pass_rate} />
                  </td>
                  <td className="p-3 text-right">{r.total_passers?.toLocaleString()}</td>
                  <td className="p-3 text-right">{r.total_takers?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

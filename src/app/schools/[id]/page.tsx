import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Card,
  StatCard,
  SectionTitle,
  NotConnected,
  PassRate,
  ConsistencyBadge,
} from "@/components/ui";
import { LineTrend } from "@/components/charts/LineTrend";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSchoolProfile } from "@/lib/queries";
import type { ConsistencyLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) return { title: "School" };
  try {
    const p = await getSchoolProfile(Number(id));
    return { title: p ? (p.school as any).name : "School" };
  } catch {
    return { title: "School" };
  }
}

export default async function SchoolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const schoolId = Number(id);
  if (!Number.isInteger(schoolId)) notFound();

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">School profile</h1>
        <NotConnected />
      </div>
    );
  }

  let profile;
  try {
    profile = await getSchoolProfile(schoolId);
  } catch {
    return <NotConnected />;
  }
  if (!profile) notFound();

  const school = profile.school as any;
  const s = profile.summary;
  const history = profile.history;

  // Build trend (school vs national), oldest -> newest.
  const trendData = [...history]
    .reverse()
    .filter((h) => h.pass_rate != null)
    .map((h) => ({
      label: `${h.month ?? ""} ${h.year}`.trim(),
      school: h.pass_rate,
      national: h.national_rate,
    }));

  const ranks = history.map((h) => h.rank).filter((x): x is number => x != null);

  return (
    <div className="space-y-8">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        School-level analytics are limited in this MVP — see{" "}
        <Link href="/exams" className="font-medium text-brand hover:underline">
          national exam trends
        </Link>
        .
      </p>

      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">{school.name}</h1>
        <div className="mt-1 text-sm text-slate-600">
          {[school.regions?.name, school.provinces?.name, school.school_type]
            .filter(Boolean)
            .join(" · ") || "Location not yet classified"}
        </div>
      </div>

      <SectionTitle>Performance summary</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Latest Pass Rate"
          value={history[0] ? <PassRate value={history[0].pass_rate} /> : "—"}
        />
        <StatCard label="Avg Pass Rate" value={s.avg_pass_rate != null ? `${s.avg_pass_rate}%` : "—"} />
        <StatCard label="Best Year" value={s.best_pass_rate != null ? `${s.best_pass_rate}%` : "—"} />
        <StatCard label="Exams Tracked" value={s.exams_participated} />
        <StatCard label="Above National" value={`${s.times_above_national}x`} />
        <Card className="text-center">
          <div className="text-xs uppercase tracking-wider text-slate-500">Consistency</div>
          <div className="mt-2">
            <ConsistencyBadge label={s.consistency_label as ConsistencyLabel} />
          </div>
          {s.consistency_score != null && (
            <div className="mt-1 text-sm text-slate-400">{s.consistency_score}/100</div>
          )}
        </Card>
      </div>

      {trendData.length >= 2 && (
        <section>
          <SectionTitle>Pass rate vs national</SectionTitle>
          <Card>
            <LineTrend data={trendData} />
          </Card>
        </section>
      )}

      {ranks.length > 0 && (
        <section>
          <SectionTitle>Ranking history</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Best Rank" value={`#${Math.min(...ranks)}`} />
            <StatCard label="Lowest Rank" value={`#${Math.max(...ranks)}`} />
            <StatCard label="Cycles Ranked" value={ranks.length} />
            <StatCard label="Latest Rank" value={history[0]?.rank ? `#${history[0].rank}` : "—"} />
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Historical results</SectionTitle>
        {history.length === 0 ? (
          <Card>No historical results recorded yet.</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="data-table w-full text-sm">
              <thead className="border-b border-ink-line bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="p-3">Year</th>
                  <th className="p-3">Examination</th>
                  <th className="p-3 text-right">Passers</th>
                  <th className="p-3 text-right">Examinees</th>
                  <th className="p-3 text-right">Pass Rate</th>
                  <th className="p-3 text-right">vs National</th>
                  <th className="p-3 text-right">Rank</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-ink-line/80">
                    <td className="p-3">
                      {h.month ? `${h.month} ` : ""}
                      {h.year}
                    </td>
                    <td className="p-3">
                      <Link href={`/exams/${h.slug}`}>{h.exam_code}</Link>
                    </td>
                    <td className="p-3 text-right">{h.passers ?? "—"}</td>
                    <td className="p-3 text-right">{h.takers ?? "—"}</td>
                    <td className="p-3 text-right">
                      <PassRate value={h.pass_rate} />
                    </td>
                    <td
                      className={`p-3 text-right ${
                        (h.gap_from_national ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {h.gap_from_national != null
                        ? `${h.gap_from_national >= 0 ? "+" : ""}${h.gap_from_national}`
                        : "—"}
                    </td>
                    <td className="p-3 text-right text-slate-600">
                      {h.rank ? `#${h.rank}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}

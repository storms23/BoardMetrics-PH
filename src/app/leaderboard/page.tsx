import { Card, SectionTitle, NotConnected, ConsistencyBadge, SchoolLink, PassRate } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { topByConsistency, examPopularity } from "@/lib/queries";
import type { ConsistencyLabel } from "@/lib/types";

export const metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-white">Top schools leaderboard</h1>
        <NotConnected />
      </div>
    );
  }

  let leaders: any[] = [];
  let popularity: any[] = [];
  try {
    [leaders, popularity] = await Promise.all([topByConsistency(25), examPopularity()]);
  } catch {
    return <NotConnected />;
  }

  const isProvisional = leaders.length > 0 && leaders[0].score === null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Top schools leaderboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Schools ranked by long-term consistency across all board exam programs.
        </p>
      </div>

      <section>
        <SectionTitle>
          {isProvisional ? "Top schools by average pass rate (provisional)" : "Most consistent schools"}
        </SectionTitle>

        {isProvisional && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Consistency Scores are still being computed from historical data. Showing average pass rate ranking in the meantime — full scores will appear once multi-year data is processed.
          </div>
        )}

        {leaders.length === 0 ? (
          <Card>
            <p className="text-slate-400">
              No school performance data available yet.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Data will appear here once the scraper has collected at least 2 years of results for each board exam.
              The scraper runs automatically every Sunday, or can be triggered manually via GitHub Actions.
            </p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-line text-left text-slate-400">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">School</th>
                  <th className="p-3">Exam</th>
                  <th className="p-3 text-right">Avg Rate</th>
                  <th className="p-3 text-right">Years</th>
                  {!isProvisional && <th className="p-3 text-right">Score</th>}
                  {!isProvisional && <th className="p-3">Rating</th>}
                </tr>
              </thead>
              <tbody>
                {leaders.map((l, i) => (
                  <tr key={`${l.school_id}-${l.exam_code}`} className="border-b border-ink-line/50 hover:bg-white/5">
                    <td className="p-3 text-slate-500">{i + 1}</td>
                    <td className="p-3">
                      <SchoolLink id={l.school_id} name={l.school} />
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-400">{l.exam_code}</td>
                    <td className="p-3 text-right">
                      <PassRate value={l.avg_rate} />
                    </td>
                    <td className="p-3 text-right text-slate-300">{l.years}</td>
                    {!isProvisional && (
                      <td className="p-3 text-right font-semibold text-white">{l.score}</td>
                    )}
                    {!isProvisional && (
                      <td className="p-3">
                        <ConsistencyBadge label={l.label as ConsistencyLabel} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Examination popularity (all-time examinees)</SectionTitle>
        {popularity.length === 0 ? (
          <Card>
            <p className="text-slate-400">No exam data yet.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-line text-left text-slate-400">
                <tr>
                  <th className="p-3">Examination</th>
                  <th className="p-3 text-right">All-time Examinees</th>
                  <th className="p-3 text-right">Exam Cycles Tracked</th>
                </tr>
              </thead>
              <tbody>
                {popularity.map((p) => (
                  <tr key={p.exam_code} className="border-b border-ink-line/50 hover:bg-white/5">
                    <td className="p-3 text-white">{p.exam_fullname}</td>
                    <td className="p-3 text-right">{p.all_time_takers?.toLocaleString() ?? "—"}</td>
                    <td className="p-3 text-right">{p.cycles}</td>
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

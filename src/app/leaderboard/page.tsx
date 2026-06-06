import { Card, SectionTitle, NotConnected, ConsistencyBadge, SchoolLink } from "@/components/ui";
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

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold text-white">Top schools leaderboard</h1>

      <section>
        <SectionTitle>Most consistent schools (by Consistency Score)</SectionTitle>
        {leaders.length === 0 ? (
          <Card>No consistency scores computed yet. Run the scraper, then consistency.py.</Card>
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
                  <th className="p-3 text-right">Score</th>
                  <th className="p-3">Rating</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((l, i) => (
                  <tr key={`${l.school_id}-${l.exam_code}`} className="border-b border-ink-line/50">
                    <td className="p-3 text-slate-500">{i + 1}</td>
                    <td className="p-3">
                      <SchoolLink id={l.school_id} name={l.school} />
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-400">{l.exam_code}</td>
                    <td className="p-3 text-right">{l.avg_rate}%</td>
                    <td className="p-3 text-right">{l.years}</td>
                    <td className="p-3 text-right font-semibold text-white">{l.score}</td>
                    <td className="p-3">
                      <ConsistencyBadge label={l.label as ConsistencyLabel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Examination popularity (all-time examinees)</SectionTitle>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-line text-left text-slate-400">
              <tr>
                <th className="p-3">Examination</th>
                <th className="p-3 text-right">All-time Examinees</th>
                <th className="p-3 text-right">Cycles Tracked</th>
              </tr>
            </thead>
            <tbody>
              {popularity.map((p) => (
                <tr key={p.exam_code} className="border-b border-ink-line/50">
                  <td className="p-3 text-white">{p.exam_fullname}</td>
                  <td className="p-3 text-right">{p.all_time_takers?.toLocaleString()}</td>
                  <td className="p-3 text-right">{p.cycles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, StatCard, SectionTitle, NotConnected, PassRate, SchoolLink } from "@/components/ui";
import { LineTrend } from "@/components/charts/LineTrend";
import { BarDistribution } from "@/components/charts/BarDistribution";
import { getProgramBySlug, PROGRAMS } from "@/lib/programs";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  examDifficulty,
  examTopSchools,
  getExamHistory,
  passRateDistribution,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return PROGRAMS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const program = getProgramBySlug(slug);
  return { title: program ? program.name : "Examination" };
}

export default async function ExamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const program = getProgramBySlug(slug);
  if (!program) notFound();

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">{program.name}</h1>
        <NotConnected />
      </div>
    );
  }

  let history: any[] = [];
  let topSchools: any[] = [];
  let difficulty: any = null;
  let distribution: any[] = [];
  try {
    [history, topSchools, difficulty, distribution] = await Promise.all([
      getExamHistory(program.examCode),
      examTopSchools(program.examCode, undefined, undefined, 15),
      examDifficulty(program.examCode),
      passRateDistribution(program.examCode),
    ]);
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">{program.name}</h1>
        <NotConnected />
      </div>
    );
  }

  const latest = history[0];
  const trendData = (difficulty?.data ?? []).map((d: any) => ({
    label: `${d.month ?? ""} ${d.year}`.trim(),
    national: d.national_pass_rate,
  }));
  const topSchoolYear = topSchools[0]?.year;

  return (
    <div className="space-y-8">
      <div>
        <div className="font-mono text-xs text-slate-500">{program.examCode}</div>
        <h1 className="text-2xl font-extrabold text-slate-900">{program.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Latest National Rate"
          value={latest ? <PassRate value={latest.pass_rate} /> : "—"}
          sub={latest ? `${latest.month ?? ""} ${latest.year}`.trim() : undefined}
        />
        <StatCard
          label="Total Examinees"
          value={
            latest?.total_takers != null ? latest.total_takers.toLocaleString() : "—"
          }
        />
        <StatCard
          label="Total Passers"
          value={
            latest?.total_passers != null ? latest.total_passers.toLocaleString() : "—"
          }
        />
        <StatCard
          label="Avg Rate (all years)"
          value={difficulty?.avg_rate != null ? `${difficulty.avg_rate}%` : "—"}
          sub={`High ${difficulty?.highest_rate ?? "—"}% · Low ${difficulty?.lowest_rate ?? "—"}%`}
        />
      </div>

      {latest?.source_url && (
        <p className="text-xs text-slate-600">
          Latest cycle source:{" "}
          <a href={latest.source_url} target="_blank" rel="noopener noreferrer">
            {latest.source_url.replace(/^https?:\/\//, "")}
          </a>
          {" · "}Ingested via automated scraper from publicly available PRC result posts.
        </p>
      )}

      {trendData.length > 1 && (
        <section>
          <SectionTitle>
            National passing rate trend ({trendData[0]?.label}–{trendData[trendData.length - 1]?.label})
          </SectionTitle>
          <Card>
            <LineTrend data={trendData} />
          </Card>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <SectionTitle>
            Top performing schools{topSchoolYear ? ` — ${topSchoolYear}` : ""}
          </SectionTitle>
          {topSchoolYear && (
            <Link
              href={`/rankings?exam_code=${program.examCode}&year=${topSchoolYear}`}
              className="text-xs text-brand hover:underline"
            >
              View all schools (~250+) →
            </Link>
          )}
        </div>
        {topSchools.length === 0 ? (
          <Card>No school-level data yet for this exam.</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="data-table w-full text-sm">
              <thead className="border-b border-ink-line bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">School</th>
                  <th className="p-3 text-right">Examinees</th>
                  <th className="p-3 text-right">Passers</th>
                  <th className="p-3 text-right">Pass Rate</th>
                </tr>
              </thead>
              <tbody>
                {topSchools.map((s) => (
                  <tr key={`${s.school_id}-${s.year}`} className="border-b border-ink-line/80">
                    <td className="p-3 text-slate-500">{s.rank}</td>
                    <td className="p-3">
                      <SchoolLink id={s.school_id} name={s.school} />
                    </td>
                    <td className="p-3 text-right">{s.takers ?? "—"}</td>
                    <td className="p-3 text-right">{s.passers ?? "—"}</td>
                    <td className="p-3 text-right">
                      <PassRate value={s.pass_rate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {distribution.some((d) => d.count > 0) && (
        <section>
          <SectionTitle>School pass-rate distribution</SectionTitle>
          <Card>
            <BarDistribution data={distribution} />
          </Card>
        </section>
      )}
    </div>
  );
}

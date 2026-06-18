import Link from "next/link";
import { Card, PassRate, SectionTitle } from "@/components/ui";
import { PROGRAMS } from "@/lib/programs";
import { listExams } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SearchBar } from "@/components/SearchBar";

export const dynamic = "force-dynamic";

type ExamStat = Awaited<ReturnType<typeof listExams>>[number];

function sortByAvgRate(list: ExamStat[], ascending: boolean): ExamStat[] {
  return [...list]
    .filter((e) => e.complete_cycles > 0 && e.avg_national_pass_rate != null)
    .sort((a, b) =>
      ascending
        ? (a.avg_national_pass_rate ?? 0) - (b.avg_national_pass_rate ?? 0)
        : (b.avg_national_pass_rate ?? 0) - (a.avg_national_pass_rate ?? 0),
    );
}

function shortName(name: string): string {
  return name.replace(" Licensure Examination", "");
}

export default async function HomePage() {
  let hardest: ExamStat[] = [];
  let easiest: ExamStat[] = [];
  const connected = isSupabaseConfigured();

  if (connected) {
    try {
      const examList = await listExams();
      hardest = sortByAvgRate(examList, true).slice(0, 3);
      easiest = sortByAvgRate(examList, false).slice(0, 3);
    } catch {
      // omit snapshot when DB unavailable
    }
  }

  return (
    <div className="space-y-12">
      <section className="space-y-5 py-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          PRC board exam results,
          <br />
          <span className="text-brand-dark">searchable and analyzable.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-slate-600">
          National pass-rate history, trends, and comparisons across{" "}
          {PROGRAMS.length} licensure programs — by exam and year.
        </p>
        <div className="mx-auto max-w-xl">
          <SearchBar />
        </div>
        <p className="text-xs text-slate-500">
          Try: “Nursing 2025” · “Civil Engineering” · “CPALE”
        </p>
      </section>

      {connected && (hardest.length > 0 || easiest.length > 0) && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <SectionTitle>National pass-rate snapshot</SectionTitle>
              <p className="-mt-2 text-xs text-slate-500">10-year avg · exams with complete data</p>
            </div>
            <Link href="/exams" className="text-xs text-brand hover:underline">
              View all exams →
            </Link>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {hardest.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Hardest (lowest avg)
                </h3>
                <div className="grid gap-2">
                  {hardest.map((e) => (
                    <Link key={e.exam_code} href={`/exams/${e.slug}`}>
                      <Card className="flex items-center justify-between gap-3 transition-colors hover:border-brand">
                        <span className="text-sm font-medium text-slate-900">
                          {shortName(e.exam_fullname)}
                        </span>
                        <PassRate value={e.avg_national_pass_rate} />
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {easiest.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Highest avg pass rates
                </h3>
                <div className="grid gap-2">
                  {easiest.map((e) => (
                    <Link key={e.exam_code} href={`/exams/${e.slug}`}>
                      <Card className="flex items-center justify-between gap-3 transition-colors hover:border-brand">
                        <span className="text-sm font-medium text-slate-900">
                          {shortName(e.exam_fullname)}
                        </span>
                        <PassRate value={e.avg_national_pass_rate} />
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Browse by examination
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PROGRAMS.map((p) => (
            <Link
              key={p.examCode}
              href={`/exams/${p.slug}`}
              className="rounded-xl border border-ink-line bg-ink-soft p-4 shadow-sm transition-colors hover:border-brand"
            >
              <div className="text-sm font-semibold text-slate-900">
                {p.name.replace(" Licensure Examination", "")}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500">
                {p.examCode}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

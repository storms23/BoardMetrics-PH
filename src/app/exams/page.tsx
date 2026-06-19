import Link from "next/link";
import { Card, NotConnected, PassRate, SectionTitle } from "@/components/ui";
import { PROGRAMS, getProgramByCode } from "@/lib/programs";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { listExams } from "@/lib/queries";
import { ExamProgramGrid } from "@/components/ExamProgramGrid";
import { ProgramIcon } from "@/components/ProgramIcon";

export const metadata = { title: "Board Examinations" };
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

function ExamSnapshotCard({ exam }: { exam: ExamStat }) {
  const program = getProgramByCode(exam.exam_code);

  return (
    <Link href={`/exams/${exam.slug}`}>
      <Card className="h-full transition-colors hover:border-brand">
        <div className="flex gap-3">
          {program && (
            <ProgramIcon
              iconKey={program.iconKey}
              category={program.category}
              size="sm"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">
              {shortName(exam.exam_fullname)}
            </div>
            <div className="mt-2 text-lg font-extrabold tabular-nums">
              <PassRate value={exam.avg_national_pass_rate} />
            </div>
            <div className="mt-1 text-xs text-slate-500">
              10-year avg · {exam.complete_cycles} cycle{exam.complete_cycles === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default async function ExamsPage() {
  const connected = isSupabaseConfigured();
  let examList: ExamStat[] = [];
  if (connected) {
    try {
      examList = await listExams();
    } catch {
      examList = [];
    }
  }

  const stats = Object.fromEntries(examList.map((e) => [e.exam_code, e]));
  const hardest = sortByAvgRate(examList, true).slice(0, 5);
  const easiest = sortByAvgRate(examList, false).slice(0, 3);
  const withData = examList.filter((e) => e.complete_cycles > 0).length;
  const missingData = PROGRAMS.length - withData;

  if (!connected) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Board Examinations</h1>
        <NotConnected />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Board Examinations</h1>
        <p className="mt-1 text-sm text-slate-600">
          National pass-rate history (last 10 years) for {PROGRAMS.length} PRC licensure programs.
          {missingData > 0 && (
            <span className="text-amber-700">
              {" "}
              {missingData} program{missingData === 1 ? "" : "s"} still need national stats.
            </span>
          )}
        </p>
      </div>

      {hardest.length > 0 && (
        <section>
          <SectionTitle>Hardest exams (lowest avg pass rate)</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {hardest.map((e) => (
              <ExamSnapshotCard key={e.exam_code} exam={e} />
            ))}
          </div>
        </section>
      )}

      {easiest.length > 0 && (
        <section>
          <SectionTitle>Highest pass rates</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {easiest.map((e) => (
              <ExamSnapshotCard key={e.exam_code} exam={e} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <SectionTitle>All programs ({PROGRAMS.length})</SectionTitle>
        <ExamProgramGrid stats={stats} />
      </section>
    </div>
  );
}

import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui";
import { PROGRAMS } from "@/lib/programs";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { listExams } from "@/lib/queries";

export const metadata = { title: "Board Examinations" };
export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  let stats: Record<string, any> = {};
  if (isSupabaseConfigured()) {
    try {
      const list = await listExams();
      stats = Object.fromEntries(list.map((e) => [e.exam_code, e]));
    } catch {
      stats = {};
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-slate-900">Board Examinations</h1>
      <SectionTitle>{PROGRAMS.length} supported programs</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PROGRAMS.map((p) => {
          const s = stats[p.examCode];
          return (
            <Link key={p.examCode} href={`/exams/${p.slug}`}>
              <Card className="h-full transition-colors hover:border-brand">
                <div className="font-semibold text-slate-900">{p.name}</div>
                <div className="mt-1 font-mono text-xs text-slate-500">{p.examCode}</div>
                {s && (
                  <div className="mt-3 text-xs text-slate-600">
                    Avg national pass rate:{" "}
                    <span className="text-brand">{s.avg_national_pass_rate ?? "—"}%</span>
                    <br />
                    Cycles tracked: {s.total_cycles}
                  </div>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

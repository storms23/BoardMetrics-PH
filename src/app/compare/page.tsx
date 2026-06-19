import { ExamCompareTool } from "@/components/CompareTool";
import { NotConnected } from "@/components/ui";
import { getProgramByCode, PROGRAMS } from "@/lib/programs";
import { compareExams } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Compare Examinations" };
export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ codes?: string }>;
}) {
  const { codes = "" } = await searchParams;
  const initialCodes = codes
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter((c) => getProgramByCode(c));

  let exams: Awaited<ReturnType<typeof compareExams>> = [];
  const connected = isSupabaseConfigured();

  if (connected && initialCodes.length > 0) {
    try {
      exams = await compareExams(initialCodes);
    } catch {
      return (
        <div className="space-y-6">
          <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Compare examinations</h1>
          <NotConnected />
        </div>
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Compare examinations</h1>
        <p className="mt-1 text-sm text-slate-600">
          Side-by-side national pass rates across {PROGRAMS.length} board exams — last 10 years.
        </p>
      </div>
      {!connected ? (
        <NotConnected />
      ) : (
        <ExamCompareTool initialCodes={initialCodes} exams={exams} />
      )}
    </div>
  );
}

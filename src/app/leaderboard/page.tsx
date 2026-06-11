import Link from "next/link";
import { Card, SectionTitle, NotConnected, SchoolLink, PassRate } from "@/components/ui";
import { SearchBar } from "@/components/SearchBar";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { leaderboardByProgram, examPopularity } from "@/lib/queries";
import { PROGRAMS, getProgramByCode } from "@/lib/programs";

export const metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ exam_code?: string }>;
}) {
  const sp = await searchParams;
  const examCode = sp.exam_code?.trim() || "";
  const program = examCode ? getProgramByCode(examCode) : undefined;

  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Leaderboard</h1>
        <NotConnected />
      </div>
    );
  }

  let boards: Awaited<ReturnType<typeof leaderboardByProgram>> = [];
  let popularity: Awaited<ReturnType<typeof examPopularity>> = [];
  try {
    [boards, popularity] = await Promise.all([leaderboardByProgram(15), examPopularity()]);
  } catch {
    return <NotConnected />;
  }

  const board = examCode ? boards.find((b) => b.exam_code === examCode) : undefined;
  const programLabel =
    program?.name.replace(" Licensure Examination", "") ?? examCode;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Top schools by pass rate (passers ÷ examinees). Schools need at least 10
          examinees to qualify.
        </p>
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="min-w-[16rem] flex-1 text-xs text-slate-600">
            Examination
            <select
              name="exam_code"
              required
              defaultValue={examCode}
              className="field-input mt-1 w-full"
            >
              <option value="" disabled>
                Select an examination…
              </option>
              {PROGRAMS.map((p) => (
                <option key={p.examCode} value={p.examCode}>
                  {p.examCode} — {p.name.replace(" Licensure Examination", "")}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Show leaderboard
          </button>
        </form>
      </Card>

      {!examCode ? (
        <Card>
          <p className="text-sm text-slate-700">
            Choose an examination above to view the top-performing schools.
          </p>
        </Card>
      ) : !program ? (
        <Card>
          <p className="text-sm text-slate-700">Unknown examination code.</p>
        </Card>
      ) : !board || board.leaders.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-700">
            No leaderboard data for {programLabel} yet.
          </p>
        </Card>
      ) : (
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{board.exam_name}</h2>
              <p className="text-xs text-slate-600">
                Highest weighted pass rate across all ingested exam cycles
              </p>
            </div>
            <Link
              href={`/rankings?exam_code=${board.exam_code}`}
              className="no-underline-link text-xs text-brand hover:text-brand-dark"
            >
              View all {board.exam_code} schools →
            </Link>
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="data-table w-full text-sm">
              <thead className="border-b border-ink-line bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">School</th>
                  <th className="p-3 text-right">Pass Rate</th>
                  <th className="p-3 text-right">Passers</th>
                  <th className="p-3 text-right">Examinees</th>
                  <th className="p-3 text-right">Cycles</th>
                </tr>
              </thead>
              <tbody>
                {board.leaders.map((l, i) => (
                  <tr
                    key={`${l.school_id}-${board.exam_code}`}
                    className="border-b border-ink-line/80"
                  >
                    <td className="p-3 text-slate-600">{i + 1}</td>
                    <td className="p-3">
                      <SchoolLink id={l.school_id} name={l.school} />
                    </td>
                    <td className="p-3 text-right font-semibold">
                      <PassRate value={l.pass_rate} />
                    </td>
                    <td className="p-3 text-right text-slate-800">
                      {l.total_passers.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-slate-800">
                      {l.total_takers.toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-slate-700">{l.cycles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <div className="max-w-xl">
        <SearchBar />
        <p className="mt-1 text-xs text-slate-600">
          Looking for a specific school? Try &quot;valenzuela&quot;, &quot;pamantasan&quot;, or &quot;PLV&quot;.
        </p>
      </div>

      <section>
        <SectionTitle>Examination popularity (all-time examinees)</SectionTitle>
        {popularity.length === 0 ? (
          <Card>
            <p className="text-slate-700">No exam data yet.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="data-table w-full text-sm">
              <thead className="border-b border-ink-line bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="p-3">Examination</th>
                  <th className="p-3 text-right">All-time Examinees</th>
                  <th className="p-3 text-right">Exam Cycles Tracked</th>
                </tr>
              </thead>
              <tbody>
                {popularity.map((p) => (
                  <tr key={p.exam_code} className="border-b border-ink-line/80">
                    <td className="p-3 font-medium text-slate-900">{p.exam_fullname}</td>
                    <td className="p-3 text-right text-slate-800">
                      {p.all_time_takers?.toLocaleString() ?? "—"}
                    </td>
                    <td className="p-3 text-right text-slate-800">{p.cycles}</td>
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

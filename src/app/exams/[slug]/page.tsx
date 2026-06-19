import { ExamHistoryPanel } from "@/components/ExamHistoryPanel";
import {
  Card,
  CoverageBadge,
  NotConnected,
  SectionTitle,
  StatCard,
  TrackerScope,
} from "@/components/ui";
import {
  avgPassRate,
  compareExamCycles,
  computeCoverage,
  enrichCycles,
  filterTrackerWindow,
  formatCycleLabel,
  isCompleteNationalRow,
  shortCycleLabel,
  sumNationalTotals,
  trackerYearRange,
  TRACKER_WINDOW_YEARS,
} from "@/lib/exam-tracker";
import { getProgramBySlug, PROGRAMS } from "@/lib/programs";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { examDifficulty, examTopnotchersLatest, getExamCycles } from "@/lib/queries";
import { notFound } from "next/navigation";

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

  let cycles: Awaited<ReturnType<typeof getExamCycles>> = [];
  let difficulty: Awaited<ReturnType<typeof examDifficulty>> | null = null;
  let topnotcherData: Awaited<ReturnType<typeof examTopnotchersLatest>> = {
    cycle: null,
    topnotchers: [],
  };

  try {
    [cycles, difficulty, topnotcherData] = await Promise.all([
      getExamCycles(program.examCode),
      examDifficulty(program.examCode),
      examTopnotchersLatest(program.examCode),
    ]);
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-slate-900">{program.name}</h1>
        <NotConnected />
      </div>
    );
  }

  const windowed = filterTrackerWindow(cycles);
  const complete = windowed.filter(isCompleteNationalRow);
  const enriched = enrichCycles(windowed);
  const coverage = computeCoverage(windowed, complete);
  const latest = complete[0] ?? windowed[0];
  const tenYearAvg = avgPassRate(complete);
  const { totalTakers, totalPassers, totalFailed } = sumNationalTotals(complete);
  const windowRange = trackerYearRange();
  const totalsSub =
    complete.length > 0
      ? `${TRACKER_WINDOW_YEARS}-year sum · ${complete.length} cycle${complete.length === 1 ? "" : "s"}`
      : undefined;

  const trendData = (difficulty?.data ?? []).map((d) => {
    const fullLabel = formatCycleLabel(d.month, d.year);
    return {
      label: shortCycleLabel(d.month, d.year),
      fullLabel,
      national: d.national_pass_rate,
    };
  });

  const volumeData = [...complete]
    .sort((a, b) => compareExamCycles(a, b))
    .map((d) => {
      const fullLabel = formatCycleLabel(d.month, d.year);
      return {
        label: shortCycleLabel(d.month, d.year),
        fullLabel,
        takers: d.total_takers,
      };
    });

  const combinedData = [...complete]
    .sort((a, b) => compareExamCycles(a, b))
    .map((d) => {
      const fullLabel = formatCycleLabel(d.month, d.year);
      return {
        label: shortCycleLabel(d.month, d.year),
        fullLabel,
        passRate: d.pass_rate,
        takers: d.total_takers,
      };
    });

  const historyTitle =
    coverage.yearFrom != null && coverage.yearTo != null
      ? `National results (${coverage.yearFrom}–${coverage.yearTo})`
      : `National results (${windowRange.from}–${windowRange.to})`;

  const hasCompleteData = complete.length > 0;
  const highestPass = [...complete]
    .filter((row) => row.pass_rate != null)
    .sort((a, b) => (b.pass_rate ?? 0) - (a.pass_rate ?? 0))[0];
  const lowestPass = [...complete]
    .filter((row) => row.pass_rate != null)
    .sort((a, b) => (a.pass_rate ?? 0) - (b.pass_rate ?? 0))[0];
  const scopeLabel =
    coverage.yearFrom != null && coverage.yearTo != null
      ? `${coverage.yearFrom}–${coverage.yearTo}`
      : `${windowRange.from}–${windowRange.to}`;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="font-mono text-xs text-slate-500">{program.examCode}</div>
        <h1 className="text-2xl font-extrabold text-slate-900">{program.name}</h1>
        {hasCompleteData && coverage.yearFrom != null && coverage.yearTo != null ? (
          <TrackerScope
            cycleCount={complete.length}
            yearFrom={coverage.yearFrom}
            yearTo={coverage.yearTo}
            windowYears={TRACKER_WINDOW_YEARS}
          />
        ) : (
          <CoverageBadge label={coverage.label} />
        )}
        <p className="max-w-2xl text-sm text-slate-600">
          {hasCompleteData
            ? `Official national pass rates from PRC result cycles within this ${TRACKER_WINDOW_YEARS}-year window. Stat cards and the table below use complete cycles only.`
            : `National pass rates from PRC result cycles — ${TRACKER_WINDOW_YEARS}-year tracker (${windowRange.from}–${windowRange.to}).`}
        </p>
      </div>

      {!hasCompleteData && (
        <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900">
          {windowed.length > 0 ? (
            <>
              National examinee and pass-rate stats are not available yet for this program.
              {coverage.incompleteCount > 0 && (
                <> {coverage.incompleteCount} cycle(s) were ingested as placeholders.</>
              )}
            </>
          ) : (
            <>No exam cycles have been ingested for this program yet.</>
          )}
        </Card>
      )}

      <div className="space-y-2">
        {/* Primary rates — wide hero row */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <StatCard
            variant="hero"
            tone="highlight"
            label="Latest Pass Rate"
            value={
              latest?.pass_rate != null ? `${latest.pass_rate.toFixed(2)}%` : "—"
            }
            sub={latest ? formatCycleLabel(latest.month, latest.year) : undefined}
          />
          <StatCard
            variant="hero"
            tone="pass"
            label="Highest Pass Rate"
            value={
              highestPass?.pass_rate != null
                ? `${highestPass.pass_rate.toFixed(2)}%`
                : "—"
            }
            sub={
              highestPass
                ? `${formatCycleLabel(highestPass.month, highestPass.year)} · ${scopeLabel}`
                : undefined
            }
          />
          <StatCard
            variant="hero"
            tone="fail"
            label="Lowest Pass Rate"
            value={
              lowestPass?.pass_rate != null ? `${lowestPass.pass_rate.toFixed(2)}%` : "—"
            }
            sub={
              lowestPass
                ? `${formatCycleLabel(lowestPass.month, lowestPass.year)} · ${scopeLabel}`
                : undefined
            }
          />
        </div>
        {/* Volume + average — compact summary strip */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard
            variant="summary"
            label="10-Year Avg Pass Rate"
            value={tenYearAvg != null ? `${tenYearAvg}%` : "—"}
            sub={`High ${difficulty?.highest_rate ?? "—"}% · Low ${difficulty?.lowest_rate ?? "—"}%`}
          />
          <StatCard
            variant="summary"
            label="Total Examinees"
            value={totalTakers > 0 ? totalTakers.toLocaleString() : "—"}
            sub={totalsSub}
          />
          <StatCard
            variant="summary"
            label="Total Passers"
            valueTone="pass"
            value={totalPassers > 0 ? totalPassers.toLocaleString() : "—"}
            sub={totalsSub}
          />
          <StatCard
            variant="summary"
            label="Total Failed"
            valueTone="fail"
            value={totalFailed > 0 ? totalFailed.toLocaleString() : "—"}
            sub={totalsSub}
          />
        </div>
      </div>

      {latest?.source_url && (
        <p className="text-xs text-slate-600">
          Latest cycle source:{" "}
          <a href={latest.source_url} target="_blank" rel="noopener noreferrer">
            {latest.source_url.replace(/^https?:\/\//, "")}
          </a>
          {" · "}Ingested from publicly available PRC result posts.
        </p>
      )}

      <ExamHistoryPanel
        historyTitle={historyTitle}
        exportQuery={`type=exam_history&exam_code=${program.examCode}&years=10`}
        rows={enriched}
        incompleteNote={coverage.incompleteNote}
        trendData={trendData}
        volumeData={volumeData}
        combinedData={combinedData}
        trendLabel={difficulty?.trend ?? null}
      />

      {topnotcherData.topnotchers.length > 0 && topnotcherData.cycle && (
        <section>
          <SectionTitle>Top 10 — {topnotcherData.cycle.label}</SectionTitle>
          <Card className="overflow-x-auto p-0">
            <table className="data-table w-full text-sm">
              <thead className="border-b border-ink-line bg-slate-100 text-left text-slate-700">
                <tr>
                  <th className="p-3">Rank</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">School</th>
                  <th className="p-3 text-right">Rating</th>
                </tr>
              </thead>
              <tbody>
                {topnotcherData.topnotchers.map((t) => (
                  <tr key={t.rank} className="border-b border-ink-line/80">
                    <td className="p-3 text-slate-500">{t.rank}</td>
                    <td className="p-3 font-medium text-slate-900">{t.name ?? "—"}</td>
                    <td className="p-3 text-slate-700">{t.school ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{t.rating ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}
    </div>
  );
}

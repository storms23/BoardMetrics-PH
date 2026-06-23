"use client";

import { useState } from "react";
import { CombinedStatisticsPanel } from "@/components/CombinedStatisticsPanel";
import { ExportButton } from "@/components/ExportButton";
import { PassRateTrendChart } from "@/components/charts/PassRateTrendChart";
import { RateVolumeTrend, type RateVolumePoint } from "@/components/charts/RateVolumeTrend";
import { VolumeTrend, type VolumePoint } from "@/components/charts/VolumeTrend";
import type { TrendPoint } from "@/components/charts/LineTrend";
import { ExamHistoryTable } from "@/components/ExamHistoryTable";
import { TrendInsight } from "@/components/TrendInsight";
import { TrendStatisticsPanel } from "@/components/TrendStatisticsPanel";
import { VolumeStatisticsPanel } from "@/components/VolumeStatisticsPanel";
import { Card, SectionTitle, TrendLabelBadge } from "@/components/ui";
import type { EnrichedExamCycle, TrendLabel } from "@/lib/exam-tracker";
import type {
  CombinedAnalytics,
  TrendAnalytics,
  VolumeAnalytics,
} from "@/lib/trend-analytics";

type Tab = "table" | "graph";

export function ExamHistoryPanel({
  historyTitle,
  exportQuery,
  rows,
  incompleteNote,
  trendData,
  volumeData,
  combinedData,
  trendLabel,
  trendAnalytics,
  volumeAnalytics,
  combinedAnalytics,
  sourceUrl,
}: {
  historyTitle: string;
  exportQuery: string;
  rows: EnrichedExamCycle[];
  incompleteNote?: string | null;
  trendData: TrendPoint[];
  volumeData: VolumePoint[];
  combinedData: RateVolumePoint[];
  trendLabel: TrendLabel | null;
  trendAnalytics: TrendAnalytics | null;
  volumeAnalytics: VolumeAnalytics | null;
  combinedAnalytics: CombinedAnalytics | null;
  sourceUrl?: string | null;
}) {
  const hasGraphs =
    trendData.length > 1 || volumeData.length > 1 || combinedData.length > 1;
  const [tab, setTab] = useState<Tab>("table");

  const yearLabel =
    trendAnalytics?.yearFrom != null && trendAnalytics?.yearTo != null
      ? `${trendAnalytics.yearFrom}–${trendAnalytics.yearTo}`
      : volumeAnalytics?.yearFrom != null && volumeAnalytics?.yearTo != null
        ? `${volumeAnalytics.yearFrom}–${volumeAnalytics.yearTo}`
        : "10-year window";

  const sourceHint = sourceUrl
    ? `Source: ${sourceUrl.replace(/^https?:\/\//, "")}.`
    : null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <SectionTitle>{historyTitle}</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          {hasGraphs && (
            <div
              className="inline-flex rounded-lg border-2 border-brand/30 bg-brand/5 p-1 shadow-sm"
              role="tablist"
              aria-label="National results view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "table"}
                onClick={() => setTab("table")}
                className={`min-w-[72px] rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === "table"
                    ? "bg-brand text-white shadow-sm"
                    : "text-brand-dark hover:bg-brand/15"
                }`}
              >
                Table
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "graph"}
                onClick={() => setTab("graph")}
                className={`min-w-[72px] rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === "graph"
                    ? "bg-brand text-white shadow-sm"
                    : "text-brand-dark hover:bg-brand/15"
                }`}
              >
                Graph
              </button>
            </div>
          )}
          <ExportButton query={exportQuery} />
        </div>
      </div>

      {tab === "table" || !hasGraphs ? (
        <ExamHistoryTable rows={rows} incompleteNote={incompleteNote} />
      ) : (
        <div className="space-y-6">
          {trendData.length > 1 && trendAnalytics && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                  Pass rate trend ({trendData[0]?.fullLabel}–
                  {trendData[trendData.length - 1]?.fullLabel})
                </h3>
                {trendLabel && <TrendLabelBadge label={trendLabel} />}
              </div>

              <div className="grid items-start gap-4 lg:grid-cols-[1fr_17rem]">
                <Card className="min-w-0 p-3 sm:p-4">
                  <PassRateTrendChart
                    data={trendData}
                    lowest={trendAnalytics.lowest}
                    highest={trendAnalytics.highest}
                    latest={trendAnalytics.latest}
                  />
                </Card>
                <TrendStatisticsPanel analytics={trendAnalytics} yearLabel={yearLabel} />
              </div>

              {trendAnalytics.insightText && (
                <TrendInsight text={trendAnalytics.insightText} sourceHint={sourceHint} />
              )}
            </div>
          )}

          {volumeData.length > 1 && volumeAnalytics && (
            <div className="space-y-4">
              <SectionTitle>Examinee volume over time</SectionTitle>

              <div className="grid items-start gap-4 lg:grid-cols-[1fr_17rem]">
                <Card className="min-w-0 p-3 sm:p-4">
                  <VolumeTrend
                    data={volumeData}
                    peak={volumeAnalytics.peak}
                    lowest={volumeAnalytics.lowest}
                  />
                </Card>
                <VolumeStatisticsPanel analytics={volumeAnalytics} yearLabel={yearLabel} />
              </div>

              {volumeAnalytics.insightText && (
                <TrendInsight text={volumeAnalytics.insightText} sourceHint={sourceHint} />
              )}
            </div>
          )}

          {combinedData.length > 1 && combinedAnalytics && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <SectionTitle>
                  Pass rate &amp; examinee volume ({combinedData[0]?.fullLabel}–
                  {combinedData[combinedData.length - 1]?.fullLabel})
                </SectionTitle>
                {trendLabel && <TrendLabelBadge label={trendLabel} />}
              </div>

              <div className="grid items-start gap-4 lg:grid-cols-[1fr_17rem]">
                <Card className="min-w-0 p-3 sm:p-4">
                  <RateVolumeTrend
                    data={combinedData}
                    lowestRate={combinedAnalytics.lowest}
                    highestRate={combinedAnalytics.highest}
                    peakTakers={combinedAnalytics.peakTakers}
                    lowestTakers={combinedAnalytics.lowestTakers}
                  />
                </Card>
                <CombinedStatisticsPanel analytics={combinedAnalytics} yearLabel={yearLabel} />
              </div>

              {combinedAnalytics.insightText && (
                <TrendInsight text={combinedAnalytics.insightText} sourceHint={sourceHint} />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { ExportButton } from "@/components/ExportButton";
import { LineTrend, type TrendPoint } from "@/components/charts/LineTrend";
import { RateVolumeTrend, type RateVolumePoint } from "@/components/charts/RateVolumeTrend";
import { VolumeTrend, type VolumePoint } from "@/components/charts/VolumeTrend";
import { ExamHistoryTable } from "@/components/ExamHistoryTable";
import { Card, SectionTitle, TrendLabelBadge } from "@/components/ui";
import type { EnrichedExamCycle, TrendLabel } from "@/lib/exam-tracker";

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
}: {
  historyTitle: string;
  exportQuery: string;
  rows: EnrichedExamCycle[];
  incompleteNote?: string | null;
  trendData: TrendPoint[];
  volumeData: VolumePoint[];
  combinedData: RateVolumePoint[];
  trendLabel: TrendLabel | null;
}) {
  const hasGraphs =
    trendData.length > 1 || volumeData.length > 1 || combinedData.length > 1;
  const [tab, setTab] = useState<Tab>("table");

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
        <div className="space-y-8">
          {trendData.length > 1 && (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                  Pass rate trend ({trendData[0]?.fullLabel}–
                  {trendData[trendData.length - 1]?.fullLabel})
                </h3>
                {trendLabel && <TrendLabelBadge label={trendLabel} />}
              </div>
              <Card>
                <LineTrend data={trendData} />
              </Card>
            </div>
          )}

          {volumeData.length > 1 && (
            <div>
              <SectionTitle>Examinee volume over time</SectionTitle>
              <Card>
                <VolumeTrend data={volumeData} />
              </Card>
            </div>
          )}

          {combinedData.length > 1 && (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <SectionTitle>
                  Pass rate &amp; examinee volume ({combinedData[0]?.fullLabel}–
                  {combinedData[combinedData.length - 1]?.fullLabel})
                </SectionTitle>
                {trendLabel && <TrendLabelBadge label={trendLabel} />}
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Blue area = pass rate (%), red line = examinees. Labels show every
                exam cycle.
              </p>
              <Card>
                <RateVolumeTrend data={combinedData} />
              </Card>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

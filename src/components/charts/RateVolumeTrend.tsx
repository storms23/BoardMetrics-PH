"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import type { CycleHighlight } from "@/lib/trend-analytics";
import { uniqueHighlights } from "./ChartCalloutLabel";
import { ChartFrame } from "./ChartFrame";
import { CHART_HIGHLIGHT, HIGHLIGHT_DOT_R } from "./highlight-colors";
import { AREA_DOT, AREA_STROKE } from "./chartFill";
import { ChartXAxis, chartBottomMargin } from "./ChartXAxis";
import type { ChartCycleFields } from "./chartData";
import { VolumeYAxisRail } from "./VolumeYAxisRail";

const VOLUME_STROKE = "#dc2626";
const RATE_AXIS_COLOR = "#0369a1";

export interface RateVolumePoint extends ChartCycleFields {
  passRate: number | null;
  takers: number | null;
}

function PassRateHighlightRing({
  highlight,
  fill,
  ringColor,
}: {
  highlight: CycleHighlight;
  fill: string;
  ringColor: string;
}) {
  return (
    <>
      <ReferenceDot
        x={highlight.chartLabel}
        y={highlight.rate}
        yAxisId="rate"
        r={9}
        fill="none"
        stroke={ringColor}
        strokeWidth={2}
      />
      <ReferenceDot
        x={highlight.chartLabel}
        y={highlight.rate}
        yAxisId="rate"
        r={HIGHLIGHT_DOT_R}
        fill={fill}
        stroke="#ffffff"
        strokeWidth={2}
      />
    </>
  );
}

function CombinedChartLegend() {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs font-medium text-slate-700">
      <span className="inline-flex items-center gap-1.5">
        <svg width="32" height="12" aria-hidden className="shrink-0">
          <line x1="1" y1="6" x2="31" y2="6" stroke={AREA_STROKE} strokeWidth={2.5} />
          <circle
            cx="16"
            cy="6"
            r="4"
            fill="#ffffff"
            stroke={AREA_STROKE}
            strokeWidth={2}
          />
        </svg>
        Pass rate
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="32" height="12" aria-hidden className="shrink-0">
          <line
            x1="1"
            y1="6"
            x2="31"
            y2="6"
            stroke={VOLUME_STROKE}
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        </svg>
        Examinees
      </span>
    </div>
  );
}

function CombinedChart({
  data,
  chartWidth,
  domainMax,
  pinnedRightAxis,
  rateHighlights,
  lowestRate,
  highestRate,
}: {
  data: RateVolumePoint[];
  chartWidth: number;
  domainMax: number;
  pinnedRightAxis: boolean;
  rateHighlights: CycleHighlight[];
  lowestRate?: CycleHighlight | null;
  highestRate?: CycleHighlight | null;
}) {
  const bottom = chartBottomMargin(data.length);

  return (
    <ResponsiveContainer width={chartWidth} height="100%">
      <ComposedChart
        data={data}
        margin={{
          top: 16,
          right: pinnedRightAxis ? 4 : 8,
          bottom,
          left: 4,
        }}
      >
        <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" />
        <ChartXAxis data={data} />
        <YAxis
          yAxisId="rate"
          orientation="left"
          stroke={RATE_AXIS_COLOR}
          fontSize={12}
          tick={{ fill: RATE_AXIS_COLOR }}
          domain={[0, 100]}
          unit="%"
          width={44}
        />
        <YAxis
          yAxisId="volume"
          orientation="right"
          hide={pinnedRightAxis}
          stroke={VOLUME_STROKE}
          fontSize={12}
          tick={{ fill: VOLUME_STROKE }}
          domain={[0, domainMax]}
          width={pinnedRightAxis ? 0 : 48}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        <Tooltip
          labelFormatter={(_, payload) =>
            (payload?.[0]?.payload as RateVolumePoint | undefined)?.fullLabel ??
            (payload?.[0]?.payload as RateVolumePoint | undefined)?.label ??
            ""
          }
          formatter={(value, name) => {
            if (name === "Pass rate") {
              return [typeof value === "number" ? `${value}%` : "—", "Pass rate"];
            }
            return [
              typeof value === "number" ? value.toLocaleString() : "—",
              "Examinees",
            ];
          }}
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            color: "#0f172a",
          }}
        />
        <Line
          yAxisId="rate"
          dataKey="passRate"
          name="Pass rate"
          type="monotone"
          stroke={AREA_STROKE}
          strokeWidth={2.5}
          dot={AREA_DOT}
          activeDot={{ r: 4 }}
          connectNulls
        />
        <Line
          yAxisId="volume"
          type="monotone"
          dataKey="takers"
          name="Examinees"
          stroke={VOLUME_STROKE}
          strokeWidth={2}
          strokeDasharray="5 4"
          isAnimationActive={false}
          dot={false}
          activeDot={{ r: 3 }}
          connectNulls
        />

        {lowestRate &&
          rateHighlights.some((h) => h.chartLabel === lowestRate.chartLabel) && (
            <PassRateHighlightRing
              highlight={lowestRate}
              fill={CHART_HIGHLIGHT.lowest.fill}
              ringColor={CHART_HIGHLIGHT.lowest.label}
            />
          )}

        {highestRate &&
          rateHighlights.some((h) => h.chartLabel === highestRate.chartLabel) && (
            <PassRateHighlightRing
              highlight={highestRate}
              fill={CHART_HIGHLIGHT.highest.fill}
              ringColor={CHART_HIGHLIGHT.highest.label}
            />
          )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function RateVolumeTrend({
  data,
  lowestRate,
  highestRate,
}: {
  data: RateVolumePoint[];
  lowestRate?: CycleHighlight | null;
  highestRate?: CycleHighlight | null;
  peakTakers?: unknown;
  lowestTakers?: unknown;
}) {
  const rateHighlights = uniqueHighlights([lowestRate, highestRate]);
  const takerValues = data.map((d) => d.takers).filter((x): x is number => x != null);
  const maxTakers = takerValues.length ? Math.max(...takerValues) : 100;
  const domainMax = Math.ceil(maxTakers * 1.12);
  const bottomMargin = chartBottomMargin(data.length);

  return (
    <div>
      <ChartFrame
        pointCount={data.length}
        rightRail={() => (
          <VolumeYAxisRail
            domainMax={domainMax}
            bottomMargin={bottomMargin}
            stroke={VOLUME_STROKE}
          />
        )}
      >
        {(chartWidth, { pinnedRightAxis }) => (
          <CombinedChart
            data={data}
            chartWidth={chartWidth}
            domainMax={domainMax}
            pinnedRightAxis={pinnedRightAxis}
            rateHighlights={rateHighlights}
            lowestRate={lowestRate}
            highestRate={highestRate}
          />
        )}
      </ChartFrame>
      <CombinedChartLegend />
    </div>
  );
}

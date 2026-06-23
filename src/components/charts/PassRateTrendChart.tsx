"use client";

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import type { CycleHighlight } from "@/lib/trend-analytics";
import { ChartCalloutLabel, uniqueHighlights } from "./ChartCalloutLabel";
import { CHART_HIGHLIGHT, HIGHLIGHT_DOT_R } from "./highlight-colors";
import {
  computeCalloutMargins,
  indexOfChartLabel,
  resolveCalloutPlacementsBatch,
  type CalloutPlacement,
} from "./callout-placement";
import { chartBottomMargin } from "./ChartXAxis";
import { ChartFrame } from "./ChartFrame";
import { AREA_DOT, AREA_STROKE, blueAreaGradientDef } from "./chartFill";
import type { TrendPoint } from "./LineTrend";
import { ChartXAxis } from "./ChartXAxis";

function HighlightDot({
  highlight,
  role,
  fill,
  color,
  placement,
}: {
  highlight: CycleHighlight;
  role: "Lowest" | "Highest";
  fill: string;
  color: string;
  placement: CalloutPlacement;
}) {
  return (
    <ReferenceDot
      x={highlight.chartLabel}
      y={highlight.rate}
      r={HIGHLIGHT_DOT_R}
      ifOverflow="visible"
      fill={fill}
      stroke="#ffffff"
      strokeWidth={2}
      label={(labelProps) => (
        <ChartCalloutLabel
          {...labelProps}
          role={role}
          fullLabel={highlight.fullLabel}
          valueFormatted={`${highlight.rate.toFixed(2)}%`}
          color={color}
          stackDy={placement.stackDy}
          edgeZone={placement.edgeZone}
        />
      )}
    />
  );
}

function PassRateTrendChartInner({
  data,
  lowest,
  highest,
  chartWidth,
}: {
  data: TrendPoint[];
  lowest: CycleHighlight | null;
  highest: CycleHighlight | null;
  chartWidth: number;
}) {
  const extremes = uniqueHighlights([lowest, highest]);
  const hasCallouts = extremes.length > 0;
  const gradId = useId().replace(/:/g, "");

  const lowestIndex =
    lowest && extremes.some((h) => h.chartLabel === lowest.chartLabel)
      ? indexOfChartLabel(data, lowest.chartLabel)
      : null;
  const highestIndex =
    highest && extremes.some((h) => h.chartLabel === highest.chartLabel)
      ? indexOfChartLabel(data, highest.chartLabel)
      : null;

  const placementMap = useMemo(() => {
    const items: { key: string; index: number }[] = [];
    if (lowestIndex != null) items.push({ key: "lowest", index: lowestIndex });
    if (highestIndex != null) items.push({ key: "highest", index: highestIndex });
    return resolveCalloutPlacementsBatch(items, data.length, chartWidth);
  }, [lowestIndex, highestIndex, data.length, chartWidth]);

  const maxStackDy = Math.max(
    0,
    ...[placementMap.get("lowest"), placementMap.get("highest")].map((p) => p?.stackDy ?? 0),
  );

  const highlightIndices = [lowestIndex, highestIndex].filter(
    (i): i is number => i != null,
  );

  const margins = computeCalloutMargins({
    pointCount: data.length,
    calloutCount: extremes.length,
    highlightIndices,
    baseBottom: chartBottomMargin(data.length, hasCallouts),
    maxStackDy,
  });

  return (
    <ResponsiveContainer width={chartWidth} height="100%">
      <AreaChart data={data} margin={margins}>
        <defs>{blueAreaGradientDef(gradId)}</defs>
        <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" />
        <ChartXAxis data={data} hasCallouts={hasCallouts} />
        <YAxis
          stroke="#475569"
          fontSize={12}
          tick={{ fill: "#475569" }}
          domain={[0, 100]}
          unit="%"
          width={44}
        />
        <Tooltip
          labelFormatter={(_, payload) =>
            (payload?.[0]?.payload as TrendPoint | undefined)?.fullLabel ??
            (payload?.[0]?.payload as TrendPoint | undefined)?.label ??
            ""
          }
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            color: "#0f172a",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#334155" }} />

        <Area
          type="monotone"
          dataKey="national"
          name="National"
          stroke={AREA_STROKE}
          fill={`url(#${gradId})`}
          strokeWidth={2.5}
          dot={AREA_DOT}
          activeDot={{ r: 4 }}
          connectNulls
        />

        {lowest && lowestIndex != null && placementMap.has("lowest") && (
          <HighlightDot
            highlight={lowest}
            role="Lowest"
            fill={CHART_HIGHLIGHT.lowest.fill}
            color={CHART_HIGHLIGHT.lowest.label}
            placement={placementMap.get("lowest")!}
          />
        )}

        {highest && highestIndex != null && placementMap.has("highest") && (
          <HighlightDot
            highlight={highest}
            role="Highest"
            fill={CHART_HIGHLIGHT.highest.fill}
            color={CHART_HIGHLIGHT.highest.label}
            placement={placementMap.get("highest")!}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PassRateTrendChart({
  data,
  lowest,
  highest,
  latest: _latest,
}: {
  data: TrendPoint[];
  lowest: CycleHighlight | null;
  highest: CycleHighlight | null;
  latest: CycleHighlight | null;
}) {
  void _latest;

  return (
    <ChartFrame pointCount={data.length}>
      {(chartWidth) => (
        <PassRateTrendChartInner
          data={data}
          lowest={lowest}
          highest={highest}
          chartWidth={chartWidth}
        />
      )}
    </ChartFrame>
  );
}

"use client";

import { useMemo } from "react";
import { XAxis } from "recharts";
import { buildCycleAxisLookup } from "./chartData";
import { crowdedCycleXAxis } from "./chartAxis";
import { CycleAxisTick } from "./CycleAxisTick";

type ChartXAxisProps = {
  data: { label: string; cycleMonth?: string; cycleYear?: string }[];
  hasCallouts?: boolean;
};

/** Shared categorical x-axis with month/year on separate lines. */
export function ChartXAxis({ data, hasCallouts = false }: ChartXAxisProps) {
  const xAxis = crowdedCycleXAxis(data.length, { hasCallouts });
  const lookup = useMemo(() => buildCycleAxisLookup(data), [data]);

  return (
    <XAxis
      dataKey="label"
      stroke="#475569"
      angle={xAxis.angle}
      textAnchor={xAxis.textAnchor}
      height={xAxis.height}
      interval={xAxis.interval}
      tickMargin={xAxis.tickMargin}
      tick={(props) => <CycleAxisTick {...props} lookup={lookup} />}
    />
  );
}

export function chartBottomMargin(dataLength: number, hasCallouts = false): number {
  return crowdedCycleXAxis(dataLength, { hasCallouts }).marginBottom;
}

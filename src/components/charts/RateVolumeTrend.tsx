"use client";

import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { crowdedCycleXAxis } from "./chartAxis";
import { ChartFrame } from "./ChartFrame";
import { AREA_DOT, AREA_STROKE, blueAreaGradientDef } from "./chartFill";

export interface RateVolumePoint {
  label: string;
  fullLabel?: string;
  passRate: number | null;
  takers: number | null;
}

export function RateVolumeTrend({ data }: { data: RateVolumePoint[] }) {
  const xAxis = crowdedCycleXAxis(data.length);
  const gradId = useId().replace(/:/g, "");
  const takerValues = data.map((d) => d.takers).filter((x): x is number => x != null);
  const maxTakers = takerValues.length ? Math.max(...takerValues) : 100;

  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 12, right: 12, bottom: xAxis.marginBottom, left: 4 }}
      >
        <defs>{blueAreaGradientDef(gradId)}</defs>
        <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          stroke="#475569"
          angle={xAxis.angle}
          textAnchor={xAxis.textAnchor}
          height={xAxis.height}
          interval={xAxis.interval}
          tickMargin={xAxis.tickMargin}
          tick={xAxis.tick}
        />
        <YAxis
          yAxisId="rate"
          orientation="left"
          stroke="#0369a1"
          fontSize={12}
          tick={{ fill: "#0369a1" }}
          domain={[0, 100]}
          unit="%"
          width={44}
        />
        <YAxis
          yAxisId="volume"
          orientation="right"
          stroke="#dc2626"
          fontSize={12}
          tick={{ fill: "#dc2626" }}
          domain={[0, Math.ceil(maxTakers * 1.12)]}
          width={48}
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
              return [
                typeof value === "number" ? `${value}%` : "—",
                "Pass rate",
              ];
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
        <Legend wrapperStyle={{ fontSize: 12, color: "#334155" }} />
        <Area
          yAxisId="rate"
          dataKey="passRate"
          name="Pass rate"
          type="monotone"
          fill={`url(#${gradId})`}
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
          stroke="#dc2626"
          strokeDasharray="4 4"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
    </ChartFrame>
  );
}

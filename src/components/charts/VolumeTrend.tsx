"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { crowdedCycleXAxis } from "./chartAxis";
import { ChartFrame } from "./ChartFrame";
import { AREA_DOT, AREA_STROKE, blueAreaGradientDef } from "./chartFill";

export interface VolumePoint {
  label: string;
  fullLabel?: string;
  takers: number | null;
}

export function VolumeTrend({ data }: { data: VolumePoint[] }) {
  const values = data.map((d) => d.takers).filter((x): x is number => x != null);
  const max = values.length ? Math.max(...values) : 100;
  const xAxis = crowdedCycleXAxis(data.length);
  const gradId = useId().replace(/:/g, "");

  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 12, right: 20, bottom: xAxis.marginBottom, left: 4 }}
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
          stroke="#475569"
          fontSize={12}
          tick={{ fill: "#475569" }}
          domain={[0, Math.ceil(max * 1.1)]}
          width={48}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        <Tooltip
          labelFormatter={(_, payload) =>
            (payload?.[0]?.payload as VolumePoint | undefined)?.fullLabel ??
            (payload?.[0]?.payload as VolumePoint | undefined)?.label ??
            ""
          }
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            color: "#0f172a",
          }}
          formatter={(value) => [
            typeof value === "number" ? value.toLocaleString() : "—",
            "Examinees",
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#334155" }} />
        <Area
          type="monotone"
          dataKey="takers"
          name="Examinees"
          stroke={AREA_STROKE}
          fill={`url(#${gradId})`}
          strokeWidth={2.5}
          dot={AREA_DOT}
          activeDot={{ r: 4 }}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
    </ChartFrame>
  );
}

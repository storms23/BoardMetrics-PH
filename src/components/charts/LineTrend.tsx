"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { ChartFrame } from "./ChartFrame";
import { AREA_DOT, AREA_STROKE, blueAreaGradientDef } from "./chartFill";
import { ChartXAxis, chartBottomMargin } from "./ChartXAxis";
import type { ChartCycleFields } from "./chartData";

export interface TrendPoint extends ChartCycleFields {
  school?: number | null;
  national?: number | null;
}

export function LineTrend({
  data,
  showNational = true,
}: {
  data: TrendPoint[];
  showNational?: boolean;
}) {
  const hasSchool = data.some((d) => d.school != null);
  const hasNational = showNational && data.some((d) => d.national != null);
  const gradId = useId().replace(/:/g, "");

  return (
    <ChartFrame pointCount={data.length}>
      {(chartWidth) => (
        <ResponsiveContainer width={chartWidth} height="100%">
          <AreaChart
            data={data}
            margin={{ top: 12, right: 20, bottom: chartBottomMargin(data.length), left: 4 }}
          >
            <defs>{blueAreaGradientDef(gradId)}</defs>
            <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" />
            <ChartXAxis data={data} />
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
            {(hasSchool || hasNational) && (
              <Legend wrapperStyle={{ fontSize: 12, color: "#334155" }} />
            )}
            {hasSchool && (
              <Area
                type="monotone"
                dataKey="school"
                name="School"
                stroke="#1d4ed8"
                fill="#1d4ed822"
                strokeWidth={2.5}
                dot={AREA_DOT}
                activeDot={{ r: 4 }}
                connectNulls
              />
            )}
            {hasNational && (
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
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}

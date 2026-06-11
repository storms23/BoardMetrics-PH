"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  label: string;
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

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
        <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="#475569" fontSize={12} tick={{ fill: "#475569" }} />
        <YAxis
          stroke="#475569"
          fontSize={12}
          tick={{ fill: "#475569" }}
          domain={[0, 100]}
          unit="%"
        />
        <Tooltip
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
          <Line
            type="monotone"
            dataKey="school"
            name="School"
            stroke="#1d4ed8"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        )}
        {hasNational && (
          <Line
            type="monotone"
            dataKey="national"
            name="National"
            stroke="#0369a1"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

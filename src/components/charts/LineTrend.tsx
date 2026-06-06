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
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
        <CartesianGrid stroke="#1A1A2E" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="#6A6A8A" fontSize={12} />
        <YAxis stroke="#6A6A8A" fontSize={12} domain={[0, 100]} unit="%" />
        <Tooltip
          contentStyle={{
            background: "#0D0D1E",
            border: "1px solid #1A1A2E",
            borderRadius: 8,
            color: "#E2E8F0",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="school"
          name="School"
          stroke="#A78BFA"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        {showNational && (
          <Line
            type="monotone"
            dataKey="national"
            name="National"
            stroke="#60A5FA"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS: Record<string, string> = {
  "90-100%": "#34D399",
  "80-89%": "#60A5FA",
  "70-79%": "#FBBF24",
  "Below 70%": "#FB7185",
};

export function BarDistribution({
  data,
}: {
  data: { band: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
        <CartesianGrid stroke="#1A1A2E" strokeDasharray="3 3" />
        <XAxis dataKey="band" stroke="#6A6A8A" fontSize={12} />
        <YAxis stroke="#6A6A8A" fontSize={12} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "#1A1A2E55" }}
          contentStyle={{
            background: "#0D0D1E",
            border: "1px solid #1A1A2E",
            borderRadius: 8,
            color: "#E2E8F0",
          }}
        />
        <Bar dataKey="count" name="Schools" radius={[6, 6, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.band} fill={COLORS[d.band] ?? "#A78BFA"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

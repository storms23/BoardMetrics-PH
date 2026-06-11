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
  "90-100%": "#059669",
  "80-89%": "#0284c7",
  "70-79%": "#d97706",
  "Below 70%": "#e11d48",
};

export function BarDistribution({
  data,
}: {
  data: { band: string; count: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
        <XAxis dataKey="band" stroke="#64748b" fontSize={12} />
        <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "#f1f5f980" }}
          contentStyle={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            color: "#0f172a",
          }}
        />
        <Bar dataKey="count" name="Schools" radius={[6, 6, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.band} fill={COLORS[d.band] ?? "#7c3aed"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

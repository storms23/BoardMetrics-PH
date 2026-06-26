"use client";

import type { CycleAxisParts } from "./chartData";

type TickProps = {
  x?: number | string;
  y?: number | string;
  payload?: { value?: string };
  lookup: Map<string, CycleAxisParts>;
};

/** Two-line cycle tick: abbreviated month on first line, two-digit year on second. */
export function CycleAxisTick({ x = 0, y = 0, payload, lookup }: TickProps) {
  const tx = typeof x === "number" ? x : Number(x) || 0;
  const ty = typeof y === "number" ? y : Number(y) || 0;
  const key = payload?.value ?? "";
  const parts = lookup.get(key);
  const [fallbackMonth = key, fallbackYear = ""] = key.split(/\s+/);
  const month = parts?.month ?? fallbackMonth;
  const year = parts?.year ?? fallbackYear.replace(/\D/g, "").slice(-2);

  return (
    <g transform={`translate(${tx},${ty})`}>
      <text textAnchor="middle" fill="#475569" fontSize={11} dy={12}>
        <tspan x={0} dy={0}>
          {month}
        </tspan>
        {year ? (
          <tspan x={0} dy={13}>
            {year}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

import {
  cycleAxisParts,
  formatCycleLabel,
  shortCycleLabel,
} from "@/lib/exam-tracker";

export type CycleAxisParts = { month: string; year: string };

export type ChartCycleFields = {
  label: string;
  fullLabel: string;
  cycleMonth: string;
  cycleYear: string;
};

export function buildChartCycleFields(
  month: string | null | undefined,
  year: number,
): ChartCycleFields {
  const fullLabel = formatCycleLabel(month, year);
  const parts = cycleAxisParts(month, year);
  return {
    label: shortCycleLabel(month, year),
    fullLabel,
    cycleMonth: parts.month,
    cycleYear: parts.year,
  };
}

export function buildCycleAxisLookup(
  data: { label: string; cycleMonth?: string; cycleYear?: string }[],
): Map<string, CycleAxisParts> {
  const map = new Map<string, CycleAxisParts>();
  for (const row of data) {
    map.set(row.label, {
      month: row.cycleMonth ?? row.label,
      year: row.cycleYear ?? "",
    });
  }
  return map;
}

/** Parse "May 2016" or "May 2016 (Written)" into display parts for callouts. */
export function parseCycleLabel(fullLabel: string): { cycleLine: string; month: string; year: string } {
  const trimmed = fullLabel.trim();
  const match = trimmed.match(/^(.+?)\s+(\d{4})/);
  if (match) {
    const month = match[1].replace(/\s*\([^)]+\)\s*$/, "").trim();
    const year = match[2];
    return { month, year, cycleLine: `${month} ${year}` };
  }
  return { month: trimmed, year: "", cycleLine: trimmed };
}

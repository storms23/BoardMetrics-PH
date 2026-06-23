import type { ExamResult } from "./types";

export const TRACKER_WINDOW_YEARS = 10;

export type TrendLabel = "Improving" | "Stable" | "Declining" | "Insufficient data";

export type ExamCycleRow = Pick<
  ExamResult,
  "id" | "year" | "month" | "total_takers" | "total_passers" | "pass_rate" | "source_url"
>;

export type EnrichedExamCycle = ExamCycleRow & {
  cycleLabel: string;
  deltaPts: number | null;
  isComplete: boolean;
};

export type CoverageSummary = {
  cycleCount: number;
  completeCount: number;
  incompleteCount: number;
  yearFrom: number | null;
  yearTo: number | null;
  label: string;
  incompleteNote: string | null;
};

const MONTH_ORDER: Record<string, number> = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
};

export function trackerCutoffYear(now = new Date()): number {
  return now.getFullYear() - TRACKER_WINDOW_YEARS;
}

export function isCompleteNationalRow(r: {
  total_takers?: number | null;
  pass_rate?: number | null;
}): boolean {
  return (r.total_takers ?? 0) > 0 && r.pass_rate != null;
}

/** Sort key for cycle month strings, including optional written/practical phase suffixes. */
function cycleMonthSortKey(month: string | null | undefined): { month: number; phase: number } {
  const raw = month ?? "";
  const phase = raw.includes("Practical") ? 2 : raw.includes("Written") ? 1 : 0;
  const base = raw.replace(/\s*\([^)]+\)\s*$/, "").trim();
  const firstMonth = base.split(/[–-]/)[0]?.trim() ?? "";
  return { month: MONTH_ORDER[firstMonth] ?? 0, phase };
}

export function compareExamCycles(
  a: { year: number; month?: string | null },
  b: { year: number; month?: string | null },
): number {
  if (a.year !== b.year) return a.year - b.year;
  const ka = cycleMonthSortKey(a.month);
  const kb = cycleMonthSortKey(b.month);
  if (ka.month !== kb.month) return ka.month - kb.month;
  return ka.phase - kb.phase;
}

export function formatCycleLabel(month: string | null | undefined, year: number): string {
  return `${month ?? ""} ${year}`.trim();
}

/** Two-line x-axis parts: month name + full year. */
export function cycleAxisParts(
  month: string | null | undefined,
  year: number,
): { month: string; year: string } {
  const raw = month ?? "?";
  const base = raw.replace(/\s*\([^)]+\)\s*$/, "").trim();
  const firstMonth = base.split(/[–-]/)[0]?.trim() || "?";
  return { month: firstMonth, year: String(year) };
}

/** Compact axis label for charts, e.g. March 2016 → Mar 16; May (Written) → May 26 W */
export function shortCycleLabel(month: string | null | undefined, year: number): string {
  const raw = month ?? "?";
  const phase = raw.includes("Practical") ? " P" : raw.includes("Written") ? " W" : "";
  const base = raw.replace(/\s*\([^)]+\)\s*$/, "").trim();
  const firstMonth = base.split(/[–-]/)[0]?.trim() || "?";
  const m = firstMonth.slice(0, 3);
  return `${m} ${String(year).slice(-2)}${phase}`;
}

export function filterTrackerWindow<T extends { year: number }>(
  rows: T[],
  now = new Date(),
): T[] {
  const cutoff = trackerCutoffYear(now);
  return rows.filter((r) => r.year >= cutoff);
}

export function enrichCycles(rows: ExamCycleRow[]): EnrichedExamCycle[] {
  const sortedDesc = [...rows].sort((a, b) => -compareExamCycles(a, b));
  const chronological = [...rows]
    .filter(isCompleteNationalRow)
    .sort((a, b) => compareExamCycles(a, b));

  const prevRateById = new Map<number, number>();
  for (let i = 1; i < chronological.length; i++) {
    const prev = chronological[i - 1];
    const curr = chronological[i];
    if (prev.pass_rate != null) prevRateById.set(curr.id, prev.pass_rate);
  }

  return sortedDesc.map((row) => {
    const complete = isCompleteNationalRow(row);
    const prevRate = prevRateById.get(row.id) ?? null;
    const deltaPts =
      complete && row.pass_rate != null && prevRate != null
        ? Math.round((row.pass_rate - prevRate) * 100) / 100
        : null;

    return {
      ...row,
      cycleLabel: formatCycleLabel(row.month, row.year),
      deltaPts,
      isComplete: complete,
    };
  });
}

export function computeCoverage(
  windowedRows: ExamCycleRow[],
  completeRows?: ExamCycleRow[],
): CoverageSummary {
  const complete = completeRows ?? windowedRows.filter(isCompleteNationalRow);
  const incompleteCount = windowedRows.length - complete.length;
  const years = windowedRows.map((r) => r.year);

  const yearFrom = years.length ? Math.min(...years) : null;
  const yearTo = years.length ? Math.max(...years) : null;

  const range =
    yearFrom != null && yearTo != null ? `${yearFrom}–${yearTo}` : "—";

  const label =
    complete.length > 0
      ? `${complete.length} cycle${complete.length === 1 ? "" : "s"} · ${range}`
      : windowedRows.length > 0
        ? `${windowedRows.length} cycle${windowedRows.length === 1 ? "" : "s"} · ${range}`
        : "No cycles in window";

  const incompleteNote =
    incompleteCount > 0
      ? `${incompleteCount} incomplete cycle${incompleteCount === 1 ? "" : "s"} excluded from pass-rate averages`
      : null;

  return {
    cycleCount: windowedRows.length,
    completeCount: complete.length,
    incompleteCount,
    yearFrom,
    yearTo,
    label,
    incompleteNote,
  };
}

export function avgPassRate(rows: ExamCycleRow[]): number | null {
  const rates = rows
    .filter(isCompleteNationalRow)
    .map((r) => r.pass_rate)
    .filter((x): x is number => x != null);
  if (!rates.length) return null;
  return Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100;
}

export function sumNationalTotals(rows: ExamCycleRow[]): {
  totalTakers: number;
  totalPassers: number;
  totalFailed: number;
} {
  const complete = rows.filter(isCompleteNationalRow);
  return {
    totalTakers: complete.reduce((sum, r) => sum + (r.total_takers ?? 0), 0),
    totalPassers: complete.reduce((sum, r) => sum + (r.total_passers ?? 0), 0),
    totalFailed: complete.reduce(
      (sum, r) => sum + Math.max(0, (r.total_takers ?? 0) - (r.total_passers ?? 0)),
      0,
    ),
  };
}

export function failedCount(row: {
  total_takers?: number | null;
  total_passers?: number | null;
}): number | null {
  if ((row.total_takers ?? 0) <= 0 || row.total_passers == null) return null;
  return Math.max(0, (row.total_takers ?? 0) - row.total_passers);
}

export function failedRate(row: {
  pass_rate?: number | null;
  total_takers?: number | null;
}): number | null {
  if ((row.total_takers ?? 0) <= 0 || row.pass_rate == null) return null;
  return Math.round((100 - row.pass_rate) * 100) / 100;
}

export function trackerYearRange(now = new Date()): { from: number; to: number } {
  return { from: trackerCutoffYear(now), to: now.getFullYear() };
}

export function formatDeltaPts(delta: number | null): string {
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} pts`;
}

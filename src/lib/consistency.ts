import type { ConsistencyLabel } from "./types";

/**
 * Display-side helpers for the Consistency Score. The authoritative scores are
 * precomputed by scraper/consistency.py and stored in `consistency_scores`.
 * This recomputes on the fly for school profiles when a precomputed row is
 * missing (keeps the formula identical across Python and TS).
 */
export function consistencyLabel(score: number): ConsistencyLabel {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Very Good";
  if (score >= 55) return "Good";
  if (score >= 40) return "Fair";
  return "Poor";
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function computeConsistency(
  schoolRates: number[],
  timesAboveNational: number,
): { score: number; label: ConsistencyLabel } | null {
  if (schoolRates.length < 2) return null;
  const sd = stdev(schoolRates);
  const raw = 100 - sd * 2 + (timesAboveNational / schoolRates.length) * 20;
  const score = Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
  return { score, label: consistencyLabel(score) };
}

export function classifyTrend(rates: number[]): string {
  if (rates.length < 3) return "Insufficient data";
  const slope = (rates[rates.length - 1] - rates[0]) / rates.length;
  if (slope > 1) return "Improving";
  if (slope < -1) return "Declining";
  return "Stable";
}

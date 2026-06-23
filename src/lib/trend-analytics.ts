import { classifyTrend, stdev } from "./consistency";
import {
  avgPassRate,
  compareExamCycles,
  formatCycleLabel,
  isCompleteNationalRow,
  shortCycleLabel,
  sumNationalTotals,
  type ExamCycleRow,
  type TrendLabel,
} from "./exam-tracker";

export type TrendDirection = "Increasing" | "Stable" | "Decreasing" | "Insufficient data";
export type VolatilityLabel = "Low" | "Medium" | "High";

export type CycleHighlight = {
  /** Chart x-axis key (shortCycleLabel) */
  chartLabel: string;
  fullLabel: string;
  rate: number;
};

export type VolumeHighlight = {
  chartLabel: string;
  fullLabel: string;
  takers: number;
};

export type TrendAnalytics = {
  avgPassRate: number | null;
  volatilityPts: number | null;
  volatilityLabel: VolatilityLabel | null;
  trendDirection: TrendDirection;
  trendBadge: TrendLabel;
  highest: CycleHighlight | null;
  lowest: CycleHighlight | null;
  latest: CycleHighlight | null;
  changeVsPrevious: { deltaPts: number; cycleLabel: string } | null;
  totals: { totalTakers: number; totalPassers: number; totalFailed: number };
  insightText: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  cycleCount: number;
};

export type VolumeAnalytics = {
  avgTakers: number | null;
  peak: VolumeHighlight | null;
  lowest: VolumeHighlight | null;
  latest: VolumeHighlight | null;
  changeVsPrevious: { delta: number; cycleLabel: string } | null;
  totals: { totalTakers: number; totalPassers: number; totalFailed: number };
  insightText: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  cycleCount: number;
};

export type CombinedAnalytics = {
  avgPassRate: number | null;
  highest: CycleHighlight | null;
  lowest: CycleHighlight | null;
  peakTakers: VolumeHighlight | null;
  lowestTakers: VolumeHighlight | null;
  changeVsPrevious: { deltaPts: number; cycleLabel: string } | null;
  insightText: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  cycleCount: number;
};

function mapTrendDirection(trend: string): TrendDirection {
  if (trend === "Improving") return "Increasing";
  if (trend === "Declining") return "Decreasing";
  if (trend === "Stable") return "Stable";
  return "Insufficient data";
}

function classifyVolatility(sd: number): VolatilityLabel {
  if (sd < 8) return "Low";
  if (sd <= 15) return "Medium";
  return "High";
}

function pct(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

function toHighlight(row: ExamCycleRow): CycleHighlight {
  return {
    chartLabel: shortCycleLabel(row.month, row.year),
    fullLabel: formatCycleLabel(row.month, row.year),
    rate: row.pass_rate!,
  };
}

function toVolumeHighlight(row: ExamCycleRow): VolumeHighlight {
  return {
    chartLabel: shortCycleLabel(row.month, row.year),
    fullLabel: formatCycleLabel(row.month, row.year),
    takers: row.total_takers ?? 0,
  };
}

/** Earliest cycle among ties for lowest; latest among ties for highest. */
function pickVolumeExtremes(chronological: ExamCycleRow[]): {
  peak: VolumeHighlight | null;
  lowest: VolumeHighlight | null;
  latest: VolumeHighlight | null;
} {
  if (!chronological.length) {
    return { peak: null, lowest: null, latest: null };
  }

  const takers = chronological.map((r) => r.total_takers ?? 0);
  const minT = Math.min(...takers);
  const maxT = Math.max(...takers);

  const lowestRow = chronological.find((r) => (r.total_takers ?? 0) === minT) ?? null;
  const peakRow = [...chronological].reverse().find((r) => (r.total_takers ?? 0) === maxT) ?? null;
  const latestRow = chronological[chronological.length - 1];

  return {
    lowest: lowestRow ? toVolumeHighlight(lowestRow) : null,
    peak: peakRow ? toVolumeHighlight(peakRow) : null,
    latest: latestRow ? toVolumeHighlight(latestRow) : null,
  };
}

function avgTakers(rows: ExamCycleRow[]): number | null {
  if (!rows.length) return null;
  const sum = rows.reduce((a, r) => a + (r.total_takers ?? 0), 0);
  return Math.round(sum / rows.length);
}

function generateVolumeInsight(
  chronological: ExamCycleRow[],
  stats: Omit<VolumeAnalytics, "insightText">,
): string | null {
  if (chronological.length < 2) return null;

  const { peak, lowest, latest, avgTakers: avg } = stats;
  const first = chronological[0];
  const last = chronological[chronological.length - 1];
  const firstT = first.total_takers ?? 0;
  const lastT = last.total_takers ?? 0;
  const diff = lastT - firstT;

  if (peak && lowest && peak.fullLabel !== lowest.fullLabel && avg != null) {
    const spread = peak.takers - lowest.takers;
    if (spread >= avg * 0.25) {
      return `Insight: Examinee volume ranged from ${lowest.takers.toLocaleString()} (${lowest.fullLabel}) to ${peak.takers.toLocaleString()} (${peak.fullLabel}), with a 10-year average of ${Math.round(avg).toLocaleString()} per cycle.`;
    }
  }

  if (avg != null && Math.abs(diff) >= avg * 0.15) {
    const firstLabel = formatCycleLabel(first.month, first.year);
    const lastLabel = formatCycleLabel(last.month, last.year);
    if (diff > 0) {
      return `Insight: Examinee volume rose from ${firstT.toLocaleString()} (${firstLabel}) to ${lastT.toLocaleString()} (${lastLabel}).`;
    }
    return `Insight: Examinee volume fell from ${firstT.toLocaleString()} (${firstLabel}) to ${lastT.toLocaleString()} (${lastLabel}).`;
  }

  if (peak && latest && peak.fullLabel === latest.fullLabel) {
    return `Insight: The latest cycle (${latest.fullLabel}) also recorded the highest examinee volume in the window (${peak.takers.toLocaleString()}).`;
  }

  if (avg != null) {
    return `Insight: Examinee volume averaged ${Math.round(avg).toLocaleString()} per cycle across ${chronological.length} complete administrations.`;
  }

  return null;
}

function generateCombinedInsight(
  chronological: ExamCycleRow[],
  stats: Omit<CombinedAnalytics, "insightText">,
): string | null {
  if (chronological.length < 2) return null;

  const { highest, lowest, peakTakers, avgPassRate: avg } = stats;

  if (
    peakTakers &&
    highest &&
    peakTakers.fullLabel !== highest.fullLabel &&
    peakTakers.chartLabel !== highest.chartLabel
  ) {
    const peakRow = chronological.find(
      (r) => formatCycleLabel(r.month, r.year) === peakTakers.fullLabel,
    );
    const rateAtPeak = peakRow?.pass_rate;
    if (rateAtPeak != null) {
      return `Insight: Peak examinee volume was ${peakTakers.takers.toLocaleString()} in ${peakTakers.fullLabel} (pass rate ${pct(rateAtPeak)}), while the highest pass rate was ${pct(highest.rate)} in ${highest.fullLabel}.`;
    }
  }

  if (lowest && highest && avg != null) {
    return `Insight: Pass rates ranged from ${pct(lowest.rate)} (${lowest.fullLabel}) to ${pct(highest.rate)} (${highest.fullLabel}), with a 10-year average of ${pct(avg)}.`;
  }

  if (peakTakers && lowest) {
    return `Insight: Across ${chronological.length} cycles, examinees ranged from ${stats.lowestTakers?.takers.toLocaleString() ?? "—"} to ${peakTakers.takers.toLocaleString()}.`;
  }

  return null;
}

/** Earliest cycle among ties for lowest rate; latest among ties for highest. */
function pickExtremeCycles(chronological: ExamCycleRow[]): {
  lowest: CycleHighlight | null;
  highest: CycleHighlight | null;
  latest: CycleHighlight | null;
} {
  if (!chronological.length) {
    return { lowest: null, highest: null, latest: null };
  }

  const rates = chronological.map((r) => r.pass_rate!).filter((x) => x != null);
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);

  const lowestRow =
    chronological.find((r) => r.pass_rate === minRate) ?? null;
  const highestRow =
    [...chronological].reverse().find((r) => r.pass_rate === maxRate) ?? null;
  const latestRow = chronological[chronological.length - 1];

  return {
    lowest: lowestRow ? toHighlight(lowestRow) : null,
    highest: highestRow ? toHighlight(highestRow) : null,
    latest: latestRow.pass_rate != null ? toHighlight(latestRow) : null,
  };
}

function generateInsight(
  chronological: ExamCycleRow[],
  stats: Omit<TrendAnalytics, "insightText">,
): string | null {
  if (chronological.length < 2) return null;

  const rates = chronological.map((r) => r.pass_rate!);
  const { lowest, latest, avgPassRate: avg, volatilityLabel, volatilityPts } = stats;

  if (lowest && chronological.length >= 3) {
    const minRate = lowest.rate;
    const lowestIdx = chronological.findIndex(
      (r) => r.pass_rate === minRate && formatCycleLabel(r.month, r.year) === lowest.fullLabel,
    );
    const after = chronological.slice(lowestIdx + 1);
    const recovery = after.find((r) => (r.pass_rate ?? 0) >= minRate + 5);

    if (recovery && lowestIdx > 0) {
      const beforeLow = chronological.slice(0, lowestIdx + 1);
      const peakBefore = beforeLow.length >= 2 ? beforeLow[0] : null;
      if (peakBefore && (peakBefore.pass_rate ?? 0) > minRate + 3) {
        return `Insight: Pass rates declined toward ${lowest.fullLabel} (${pct(minRate)}), then recovered starting ${formatCycleLabel(recovery.month, recovery.year)} (${pct(recovery.pass_rate!)}).`;
      }
    }

    if (recovery && latest && latest.rate >= minRate + 8) {
      return `Insight: Pass rates reached a low of ${pct(minRate)} in ${lowest.fullLabel}, then rose to ${pct(latest.rate)} by ${latest.fullLabel}.`;
    }
  }

  const first = rates[0];
  const last = rates[rates.length - 1];
  const diff = last - first;

  if (Math.abs(diff) >= 3) {
    const firstLabel = formatCycleLabel(chronological[0].month, chronological[0].year);
    const lastLabel = formatCycleLabel(
      chronological[chronological.length - 1].month,
      chronological[chronological.length - 1].year,
    );
    if (diff > 0) {
      return `Insight: Pass rates rose from ${pct(first)} (${firstLabel}) to ${pct(last)} (${lastLabel}).`;
    }
    return `Insight: Pass rates fell from ${pct(first)} (${firstLabel}) to ${pct(last)} (${lastLabel}).`;
  }

  if (volatilityLabel === "Low" && avg != null && volatilityPts != null) {
    return `Insight: Pass rates stayed relatively stable around ${pct(avg)} (σ = ${volatilityPts.toFixed(2)} pts across ${chronological.length} cycles).`;
  }

  if (lowest && latest && avg != null) {
    const high = stats.highest;
    return `Insight: Across ${chronological.length} complete cycles, pass rates ranged from ${pct(lowest.rate)} (${lowest.fullLabel}) to ${high ? pct(high.rate) : pct(latest.rate)}, with a 10-year average of ${pct(avg)}.`;
  }

  return null;
}

export function computeTrendAnalytics(rows: ExamCycleRow[]): TrendAnalytics | null {
  const complete = rows.filter(isCompleteNationalRow);
  if (!complete.length) return null;

  const chronological = [...complete].sort(compareExamCycles);
  const rates = chronological.map((r) => r.pass_rate!);
  const avg = avgPassRate(complete);
  const volatilityPts = rates.length >= 2 ? Math.round(stdev(rates) * 100) / 100 : null;
  const trendBadge = classifyTrend(rates) as TrendLabel;
  const { lowest, highest, latest } = pickExtremeCycles(chronological);
  const totals = sumNationalTotals(complete);

  let changeVsPrevious: TrendAnalytics["changeVsPrevious"] = null;
  if (chronological.length >= 2) {
    const prev = chronological[chronological.length - 2];
    const last = chronological[chronological.length - 1];
    if (last.pass_rate != null && prev.pass_rate != null) {
      changeVsPrevious = {
        deltaPts: Math.round((last.pass_rate - prev.pass_rate) * 100) / 100,
        cycleLabel: formatCycleLabel(last.month, last.year),
      };
    }
  }

  const years = chronological.map((r) => r.year);
  const base: Omit<TrendAnalytics, "insightText"> = {
    avgPassRate: avg,
    volatilityPts,
    volatilityLabel: volatilityPts != null ? classifyVolatility(volatilityPts) : null,
    trendDirection: mapTrendDirection(trendBadge),
    trendBadge,
    highest,
    lowest,
    latest,
    changeVsPrevious,
    totals,
    yearFrom: years.length ? Math.min(...years) : null,
    yearTo: years.length ? Math.max(...years) : null,
    cycleCount: chronological.length,
  };

  return {
    ...base,
    insightText: generateInsight(chronological, base),
  };
}

export function computeVolumeAnalytics(rows: ExamCycleRow[]): VolumeAnalytics | null {
  const complete = rows.filter(isCompleteNationalRow);
  if (!complete.length) return null;

  const chronological = [...complete].sort(compareExamCycles);
  const { peak, lowest, latest } = pickVolumeExtremes(chronological);
  const totals = sumNationalTotals(complete);
  const avg = avgTakers(complete);

  let changeVsPrevious: VolumeAnalytics["changeVsPrevious"] = null;
  if (chronological.length >= 2) {
    const prev = chronological[chronological.length - 2];
    const last = chronological[chronological.length - 1];
    changeVsPrevious = {
      delta: (last.total_takers ?? 0) - (prev.total_takers ?? 0),
      cycleLabel: formatCycleLabel(last.month, last.year),
    };
  }

  const years = chronological.map((r) => r.year);
  const base: Omit<VolumeAnalytics, "insightText"> = {
    avgTakers: avg,
    peak,
    lowest,
    latest,
    changeVsPrevious,
    totals,
    yearFrom: years.length ? Math.min(...years) : null,
    yearTo: years.length ? Math.max(...years) : null,
    cycleCount: chronological.length,
  };

  return {
    ...base,
    insightText: generateVolumeInsight(chronological, base),
  };
}

export function computeCombinedAnalytics(rows: ExamCycleRow[]): CombinedAnalytics | null {
  const complete = rows.filter(isCompleteNationalRow);
  if (!complete.length) return null;

  const chronological = [...complete].sort(compareExamCycles);
  const { lowest, highest } = pickExtremeCycles(chronological);
  const { peak, lowest: lowestTakers } = pickVolumeExtremes(chronological);
  const avg = avgPassRate(complete);

  let changeVsPrevious: CombinedAnalytics["changeVsPrevious"] = null;
  if (chronological.length >= 2) {
    const prev = chronological[chronological.length - 2];
    const last = chronological[chronological.length - 1];
    if (last.pass_rate != null && prev.pass_rate != null) {
      changeVsPrevious = {
        deltaPts: Math.round((last.pass_rate - prev.pass_rate) * 100) / 100,
        cycleLabel: formatCycleLabel(last.month, last.year),
      };
    }
  }

  const years = chronological.map((r) => r.year);
  const base: Omit<CombinedAnalytics, "insightText"> = {
    avgPassRate: avg,
    highest,
    lowest,
    peakTakers: peak,
    lowestTakers,
    changeVsPrevious,
    yearFrom: years.length ? Math.min(...years) : null,
    yearTo: years.length ? Math.max(...years) : null,
    cycleCount: chronological.length,
  };

  return {
    ...base,
    insightText: generateCombinedInsight(chronological, base),
  };
}

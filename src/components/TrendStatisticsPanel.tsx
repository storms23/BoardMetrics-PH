import {
  ArrowDown,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Sigma,
  TrendingUp,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import {
  CompactStatDivider,
  CompactStatPanel,
  CompactStatRow,
} from "@/components/CompactStatPanel";
import type { TrendAnalytics } from "@/lib/trend-analytics";

export function TrendStatisticsPanel({
  analytics,
  yearLabel,
}: {
  analytics: TrendAnalytics;
  yearLabel: string;
}) {
  const { highest, lowest, changeVsPrevious, totals } = analytics;
  const changeSign = changeVsPrevious && changeVsPrevious.deltaPts > 0 ? "+" : "";

  return (
    <CompactStatPanel title={`Trend statistics (${yearLabel})`}>
      <CompactStatRow
        icon={<BarChart3 />}
        label="10-Year average"
        value={analytics.avgPassRate != null ? `${analytics.avgPassRate.toFixed(2)}%` : "—"}
      />
      <CompactStatRow
        icon={<TrendingUp />}
        label="Trend direction"
        value={analytics.trendDirection}
      />
      <CompactStatRow
        icon={<Sigma />}
        label="Consistency"
        value={
          analytics.volatilityPts != null && analytics.volatilityLabel
            ? `${analytics.volatilityLabel} (σ = ${analytics.volatilityPts.toFixed(2)} pts)`
            : "—"
        }
      />
      <CompactStatRow
        icon={<Trophy />}
        label="Highest pass rate"
        value={highest ? `${highest.rate.toFixed(2)}% · ${highest.fullLabel}` : "—"}
      />
      <CompactStatRow
        icon={<ArrowDown />}
        label="Lowest pass rate"
        value={lowest ? `${lowest.rate.toFixed(2)}% · ${lowest.fullLabel}` : "—"}
      />
      <CompactStatRow
        icon={<ArrowUpRight />}
        label="Change vs prev."
        value={
          changeVsPrevious
            ? `${changeSign}${changeVsPrevious.deltaPts.toFixed(2)} pts % (${changeVsPrevious.cycleLabel})`
            : "—"
        }
      />

      <CompactStatDivider />

      <CompactStatRow
        icon={<Users />}
        label="Total examinees"
        value={totals.totalTakers > 0 ? totals.totalTakers.toLocaleString() : "—"}
      />
      <CompactStatRow
        icon={<CheckCircle2 className="text-emerald-600" />}
        label="Total passers"
        value={totals.totalPassers > 0 ? totals.totalPassers.toLocaleString() : "—"}
      />
      <CompactStatRow
        icon={<XCircle className="text-rose-600" />}
        label="Total failed"
        value={totals.totalFailed > 0 ? totals.totalFailed.toLocaleString() : "—"}
      />
    </CompactStatPanel>
  );
}

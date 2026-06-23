import { ArrowDown, ArrowUpRight, BarChart3, TrendingUp, Trophy, Users } from "lucide-react";
import {
  CompactStatPanel,
  CompactStatRow,
} from "@/components/CompactStatPanel";
import type { CombinedAnalytics } from "@/lib/trend-analytics";

export function CombinedStatisticsPanel({
  analytics,
  yearLabel,
}: {
  analytics: CombinedAnalytics;
  yearLabel: string;
}) {
  const { highest, lowest, peakTakers, lowestTakers, changeVsPrevious } = analytics;
  const changeSign = changeVsPrevious && changeVsPrevious.deltaPts > 0 ? "+" : "";

  return (
    <CompactStatPanel title={`Combined statistics (${yearLabel})`}>
      <CompactStatRow
        icon={<BarChart3 />}
        label="10-Year avg pass rate"
        value={analytics.avgPassRate != null ? `${analytics.avgPassRate.toFixed(2)}%` : "—"}
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
        icon={<TrendingUp />}
        label="Peak examinees"
        value={peakTakers ? `${peakTakers.takers.toLocaleString()} · ${peakTakers.fullLabel}` : "—"}
      />
      <CompactStatRow
        icon={<Users />}
        label="Lowest examinees"
        value={
          lowestTakers ? `${lowestTakers.takers.toLocaleString()} · ${lowestTakers.fullLabel}` : "—"
        }
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
    </CompactStatPanel>
  );
}

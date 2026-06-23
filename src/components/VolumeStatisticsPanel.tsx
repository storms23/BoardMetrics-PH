import { ArrowDown, ArrowUpRight, BarChart3, CheckCircle2, TrendingUp, Users, XCircle } from "lucide-react";
import {
  CompactStatDivider,
  CompactStatPanel,
  CompactStatRow,
} from "@/components/CompactStatPanel";
import type { VolumeAnalytics } from "@/lib/trend-analytics";

export function VolumeStatisticsPanel({
  analytics,
  yearLabel,
}: {
  analytics: VolumeAnalytics;
  yearLabel: string;
}) {
  const { peak, lowest, changeVsPrevious, totals } = analytics;
  const changeSign = changeVsPrevious && changeVsPrevious.delta > 0 ? "+" : "";

  return (
    <CompactStatPanel title={`Volume statistics (${yearLabel})`}>
      <CompactStatRow
        icon={<BarChart3 />}
        label="Average examinees"
        value={analytics.avgTakers != null ? Math.round(analytics.avgTakers).toLocaleString() : "—"}
      />
      <CompactStatRow
        icon={<TrendingUp />}
        label="Peak volume"
        value={peak ? `${peak.takers.toLocaleString()} · ${peak.fullLabel}` : "—"}
      />
      <CompactStatRow
        icon={<ArrowDown />}
        label="Lowest volume"
        value={lowest ? `${lowest.takers.toLocaleString()} · ${lowest.fullLabel}` : "—"}
      />
      <CompactStatRow
        icon={<ArrowUpRight />}
        label="Change vs prev."
        value={
          changeVsPrevious
            ? `${changeSign}${changeVsPrevious.delta.toLocaleString()} (${changeVsPrevious.cycleLabel})`
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

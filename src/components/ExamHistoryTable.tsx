import { Card, DeltaPts, EmptyState, FailedRate, PassRate, RateColumnHeader, TableScroll } from "@/components/ui";
import { failedCount, failedRate, type EnrichedExamCycle } from "@/lib/exam-tracker";

function passRateExtremes(rows: EnrichedExamCycle[]): {
  highest: number | null;
  lowest: number | null;
} {
  const rates = rows
    .filter((r) => r.isComplete && r.pass_rate != null)
    .map((r) => r.pass_rate as number);
  if (rates.length === 0) return { highest: null, lowest: null };
  return { highest: Math.max(...rates), lowest: Math.min(...rates) };
}

function rowHighlightClass(
  row: EnrichedExamCycle,
  highest: number | null,
  lowest: number | null,
): string {
  if (!row.isComplete || row.pass_rate == null || highest == null || lowest == null) {
    return "";
  }
  const rate = row.pass_rate;
  if (highest !== lowest && rate === highest) {
    return "bg-emerald-50/80";
  }
  if (highest !== lowest && rate === lowest) {
    return "bg-rose-50/80";
  }
  if (highest === lowest && rate === highest) {
    return "bg-emerald-50/80";
  }
  return "";
}

export function ExamHistoryTable({
  rows,
  incompleteNote,
}: {
  rows: EnrichedExamCycle[];
  incompleteNote?: string | null;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No national results in the last 10 years."
        hint="Run the national scraper or check back after the next PRC result release."
      />
    );
  }

  const { highest, lowest } = passRateExtremes(rows);
  const hasRange = highest != null && lowest != null && highest !== lowest;

  return (
    <div className="space-y-2">
      <Card className="overflow-hidden p-0">
        <TableScroll>
        <table className="data-table w-full text-sm">
          <thead className="border-b border-ink-line bg-slate-100 text-left text-slate-700">
            <tr>
              <th>Cycle</th>
              <th className="text-right">Examinees</th>
              <th className="text-right">Passers</th>
              <th className="text-right">Failed</th>
              <th className="text-right">
                <RateColumnHeader kind="fail">Failed rate</RateColumnHeader>
              </th>
              <th className="text-right">
                <RateColumnHeader kind="pass">Pass rate</RateColumnHeader>
              </th>
              <th className="text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const highlight = rowHighlightClass(row, highest, lowest);
              return (
              <tr
                key={row.id}
                className={`border-b border-ink-line/80 ${
                  row.isComplete ? highlight : "bg-slate-50/80 opacity-70"
                }`}
              >
                <td className="font-medium text-slate-900">{row.cycleLabel}</td>
                <td className="text-right tabular-nums">
                  {row.total_takers != null && row.total_takers > 0
                    ? row.total_takers.toLocaleString()
                    : "—"}
                </td>
                <td className="text-right tabular-nums">
                  {row.total_passers != null ? row.total_passers.toLocaleString() : "—"}
                </td>
                <td className="text-right tabular-nums">
                  {row.isComplete ? (failedCount(row)?.toLocaleString() ?? "—") : "—"}
                </td>
                <td className="text-right tabular-nums">
                  {row.isComplete ? (
                    <FailedRate value={failedRate(row)} variant="gradient" />
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="text-right">
                  {row.isComplete ? (
                    <PassRate value={row.pass_rate} variant="gradient" />
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="text-right">
                  {row.isComplete ? (
                    <DeltaPts value={row.deltaPts} />
                  ) : (
                    <span className="text-xs text-slate-500">Incomplete</span>
                  )}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
        </TableScroll>
      </Card>
      {hasRange && (
        <p className="text-xs text-slate-500">
          <span className="inline-block rounded bg-emerald-50/80 px-1.5 py-0.5">Green</span> = highest pass
          rate ·{" "}
          <span className="inline-block rounded bg-rose-50/80 px-1.5 py-0.5">Red</span> = lowest pass rate
        </p>
      )}
      {incompleteNote && (
        <p className="text-xs text-slate-500">{incompleteNote}</p>
      )}
    </div>
  );
}

import { Card, DeltaPts, EmptyState, FailedRate, PassRate, RateColumnHeader } from "@/components/ui";
import { failedCount, failedRate, type EnrichedExamCycle } from "@/lib/exam-tracker";

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

  return (
    <div className="space-y-2">
      <Card className="overflow-x-auto p-0">
        <table className="data-table w-full text-sm">
          <thead className="border-b border-ink-line bg-slate-100 text-left text-slate-700">
            <tr>
              <th className="p-3">Cycle</th>
              <th className="p-3 text-right">Examinees</th>
              <th className="p-3 text-right">Passers</th>
              <th className="p-3 text-right">Failed</th>
              <th className="p-3 text-right">
                <RateColumnHeader kind="fail">Failed rate</RateColumnHeader>
              </th>
              <th className="p-3 text-right">
                <RateColumnHeader kind="pass">Pass rate</RateColumnHeader>
              </th>
              <th className="p-3 text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-ink-line/80 ${row.isComplete ? "" : "bg-slate-50/80 opacity-70"}`}
              >
                <td className="p-3 font-medium text-slate-900">{row.cycleLabel}</td>
                <td className="p-3 text-right tabular-nums">
                  {row.total_takers != null && row.total_takers > 0
                    ? row.total_takers.toLocaleString()
                    : "—"}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {row.total_passers != null ? row.total_passers.toLocaleString() : "—"}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {row.isComplete ? (failedCount(row)?.toLocaleString() ?? "—") : "—"}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {row.isComplete ? (
                    <FailedRate value={failedRate(row)} />
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  {row.isComplete ? (
                    <PassRate value={row.pass_rate} />
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  {row.isComplete ? (
                    <DeltaPts value={row.deltaPts} />
                  ) : (
                    <span className="text-xs text-slate-500">Incomplete</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {incompleteNote && (
        <p className="text-xs text-slate-500">{incompleteNote}</p>
      )}
    </div>
  );
}

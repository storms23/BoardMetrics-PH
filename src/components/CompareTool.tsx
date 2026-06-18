"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import {
  Card,
  PassRate,
  SectionTitle,
  StatCard,
  TrendLabelBadge,
} from "@/components/ui";
import type { CompareExamResult } from "@/lib/queries";
import { PROGRAMS } from "@/lib/programs";

function shortName(name: string): string {
  return name.replace(" Licensure Examination", "");
}

export function ExamCompareTool({
  initialCodes,
  exams,
}: {
  initialCodes: string[];
  exams: CompareExamResult[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const slots = [
    initialCodes[0] ?? "",
    initialCodes[1] ?? "",
    initialCodes[2] ?? "",
  ];

  function onSelectChange() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const picked = [0, 1, 2]
      .map((i) => String(fd.get(`slot_${i}`) ?? "").trim())
      .filter(Boolean);
    const unique = [...new Set(picked)];
    const qs = unique.length ? `?codes=${unique.join(",")}` : "";
    router.push(`/compare${qs}`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <form ref={formRef} className="grid gap-3 sm:grid-cols-3">
          {slots.map((code, i) => (
            <label key={i} className="text-xs text-slate-500">
              Exam {i + 1}
              <select
                name={`slot_${i}`}
                defaultValue={code}
                onChange={onSelectChange}
                className="field-input mt-1 w-full"
              >
                <option value="">— Select —</option>
                {PROGRAMS.map((p) => (
                  <option key={p.examCode} value={p.examCode}>
                    {shortName(p.name)} ({p.examCode})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </form>
      </Card>

      {exams.length === 0 ? (
        <Card className="text-center text-slate-600">
          Select two or three examinations above to compare national pass rates.
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            {exams.map((exam) => (
              <div key={exam.exam_code} className="space-y-3">
                <div>
                  <Link
                    href={`/exams/${exam.slug}`}
                    className="font-semibold text-slate-900 hover:text-brand"
                  >
                    {shortName(exam.name)}
                  </Link>
                  <div className="font-mono text-xs text-slate-500">{exam.exam_code}</div>
                </div>
                {exam.latest_rate == null && exam.avg_10yr == null ? (
                  <Card className="text-sm text-amber-800">
                    No national stats yet for this program.
                  </Card>
                ) : (
                  <>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label="Latest rate"
                    value={
                      exam.latest_rate != null ? (
                        <PassRate value={exam.latest_rate} />
                      ) : (
                        "—"
                      )
                    }
                    sub={exam.latest_cycle ?? undefined}
                  />
                  <StatCard
                    label="10-year avg"
                    value={exam.avg_10yr != null ? `${exam.avg_10yr}%` : "—"}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Trend</span>
                  <TrendLabelBadge label={exam.trend} />
                </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <section>
            <SectionTitle>Latest 3 cycles</SectionTitle>
            <div className="grid gap-4 lg:grid-cols-3">
              {exams.map((exam) => (
                <Card key={exam.exam_code} className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead className="border-b border-ink-line bg-slate-50 text-left">
                      <tr>
                        <th className="p-2 text-xs text-slate-500" colSpan={2}>
                          {shortName(exam.name)}
                        </th>
                      </tr>
                      <tr>
                        <th className="p-2 text-xs font-medium text-slate-500">Cycle</th>
                        <th className="p-2 text-right text-xs font-medium text-slate-500">
                          Rate
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {exam.recent_cycles.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-2 text-slate-500">
                            No data
                          </td>
                        </tr>
                      ) : (
                        exam.recent_cycles.map((c) => (
                          <tr
                            key={c.label}
                            className="border-b border-ink-line/80 hover:bg-slate-50"
                          >
                            <td className="p-2 text-slate-700">{c.label}</td>
                            <td className="p-2 text-right tabular-nums">
                              <PassRate value={c.rate} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

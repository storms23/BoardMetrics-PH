import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiError, withRateLimit } from "@/lib/http";
import {
  getRankings,
  examTopSchools,
  regionalAnalytics,
  listExams,
  getExamCycles,
} from "@/lib/queries";
import { getProgramByCode } from "@/lib/programs";
import {
  enrichCycles,
  failedCount,
  failedRate,
  TRACKER_WINDOW_YEARS,
} from "@/lib/exam-tracker";

/**
 * Export module (FR-10). Streams CSV or Excel for rankings, school results,
 * exam results, and filtered reports.
 *
 *   /api/v1/export?type=rankings&exam_code=NLE&year=2025&format=csv
 *   /api/v1/export?type=exam_top&exam_code=CPALE&format=xlsx
 *   /api/v1/export?type=regions&format=csv
 *   /api/v1/export?type=exam_history&exam_code=NLE&years=10&format=csv
 */
export async function GET(req: NextRequest) {
  return withRateLimit(req, { bucket: "export", limit: 20 }, async () => {
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type") ?? "rankings";
    const format = (sp.get("format") ?? "csv").toLowerCase();

    let rows: Record<string, unknown>[] = [];
    let name = type;

    try {
      if (type === "rankings") {
        const examCode = sp.get("exam_code");
        if (!examCode) return apiError(400, "missing_param", "exam_code is required.");
        rows = await getRankings({
          examCode,
          year: sp.get("year") ? Number(sp.get("year")) : undefined,
          region: sp.get("region") ?? undefined,
          minTakers: sp.get("min_takers") ? Number(sp.get("min_takers")) : undefined,
          limit: 1000,
        });
        name = `rankings_${examCode}`;
      } else if (type === "exam_top") {
        const examCode = sp.get("exam_code");
        if (!examCode) return apiError(400, "missing_param", "exam_code is required.");
        rows = await examTopSchools(
          examCode,
          sp.get("year") ? Number(sp.get("year")) : undefined,
          undefined,
          1000,
        );
        name = `exam_top_${examCode}`;
      } else if (type === "regions") {
        rows = await regionalAnalytics(sp.get("exam_code") ?? undefined);
        name = "regional_analytics";
      } else if (type === "exams") {
        rows = await listExams();
        name = "exams_summary";
      } else if (type === "exam_history") {
        const examCode = sp.get("exam_code");
        if (!examCode) return apiError(400, "missing_param", "exam_code is required.");
        if (!getProgramByCode(examCode)) {
          return apiError(400, "invalid_param", `Unknown exam_code '${examCode}'.`);
        }
        const years = Math.min(
          TRACKER_WINDOW_YEARS,
          Math.max(1, Number(sp.get("years") ?? TRACKER_WINDOW_YEARS) || TRACKER_WINDOW_YEARS),
        );
        const cutoffYear = new Date().getFullYear() - years;
        const cycles = await getExamCycles(examCode);
        const windowed = cycles.filter((r) => r.year >= cutoffYear);
        const enriched = enrichCycles(windowed);
        rows = enriched.map((r) => ({
          year: r.year,
          month: r.month,
          cycle: r.cycleLabel,
          total_takers: r.isComplete ? r.total_takers : null,
          total_failed: r.isComplete ? failedCount(r) : null,
          total_passers: r.isComplete ? r.total_passers : null,
          failed_rate: r.isComplete ? failedRate(r) : null,
          pass_rate: r.isComplete ? r.pass_rate : null,
          delta_pts: r.isComplete ? r.deltaPts : null,
          complete: r.isComplete,
          source_url: r.source_url,
        }));
        name = `exam_history_${examCode}`;
      } else {
        return apiError(400, "bad_type", `Unknown export type '${type}'.`);
      }
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }

    if (rows.length === 0) {
      return apiError(404, "no_data", "Nothing to export for the given filters.");
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);

    if (format === "xlsx") {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
      const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buf, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${name}.xlsx"`,
        },
      });
    }

    const csv = XLSX.utils.sheet_to_csv(worksheet);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
      },
    });
  });
}

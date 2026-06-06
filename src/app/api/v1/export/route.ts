import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiError, withRateLimit } from "@/lib/http";
import {
  getRankings,
  examTopSchools,
  regionalAnalytics,
  listExams,
} from "@/lib/queries";

/**
 * Export module (FR-10). Streams CSV or Excel for rankings, school results,
 * exam results, and filtered reports.
 *
 *   /api/v1/export?type=rankings&exam_code=NLE&year=2025&format=csv
 *   /api/v1/export?type=exam_top&exam_code=CPALE&format=xlsx
 *   /api/v1/export?type=regions&format=csv
 *   /api/v1/export?type=exams&format=xlsx
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

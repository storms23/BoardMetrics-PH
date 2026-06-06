import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { globalSearch } from "@/lib/queries";
import { PROGRAMS } from "@/lib/programs";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return apiError(400, "bad_query", "Query 'q' must be at least 2 characters.");
  }
  return withRateLimit(req, { bucket: "search", limit: 120 }, async () => {
    try {
      const result = await globalSearch(q);
      const lower = q.toLowerCase();
      const exams = PROGRAMS.filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.examCode.toLowerCase().includes(lower) ||
          p.slug.includes(lower),
      ).map((p) => ({ exam_code: p.examCode, exam_fullname: p.name, slug: p.slug }));
      return json({ ...result, exams });
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

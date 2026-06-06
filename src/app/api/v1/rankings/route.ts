import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { getRankings } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const examCode = sp.get("exam_code");
  if (!examCode) {
    return apiError(400, "missing_param", "exam_code is required.");
  }
  return withRateLimit(req, { bucket: "rankings" }, async () => {
    try {
      const rankings = await getRankings({
        examCode,
        year: sp.get("year") ? Number(sp.get("year")) : undefined,
        month: sp.get("month") ?? undefined,
        region: sp.get("region") ?? undefined,
        minTakers: sp.get("min_takers") ? Number(sp.get("min_takers")) : undefined,
        limit: Math.min(200, Number(sp.get("limit") ?? 50) || 50),
      });
      return json({
        exam: examCode,
        year: sp.get("year") ? Number(sp.get("year")) : null,
        count: rankings.length,
        rankings,
      });
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

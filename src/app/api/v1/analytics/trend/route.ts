import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { schoolTrend } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const schoolId = Number(sp.get("school_id"));
  if (!Number.isInteger(schoolId) || schoolId < 1) {
    return apiError(400, "bad_id", "school_id is required and must be a positive integer.");
  }
  return withRateLimit(req, { bucket: "analytics" }, async () => {
    try {
      return json(await schoolTrend(schoolId, sp.get("exam_code") ?? undefined));
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { passRateDistribution } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const examCode = sp.get("exam_code");
  if (!examCode) {
    return apiError(400, "missing_param", "exam_code is required.");
  }
  return withRateLimit(req, { bucket: "analytics" }, async () => {
    try {
      return json(
        await passRateDistribution(
          examCode,
          sp.get("year") ? Number(sp.get("year")) : undefined,
        ),
      );
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

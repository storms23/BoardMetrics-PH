import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { examDifficulty } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const examCode = req.nextUrl.searchParams.get("exam_code");
  if (!examCode) {
    return apiError(400, "missing_param", "exam_code is required.");
  }
  return withRateLimit(req, { bucket: "analytics" }, async () => {
    try {
      return json(await examDifficulty(examCode));
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

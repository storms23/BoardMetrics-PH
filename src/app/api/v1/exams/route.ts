import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { listExams } from "@/lib/queries";

export async function GET(req: NextRequest) {
  return withRateLimit(req, { bucket: "exams" }, async () => {
    try {
      return json(await listExams());
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

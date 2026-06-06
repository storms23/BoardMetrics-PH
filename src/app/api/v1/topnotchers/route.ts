import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { listTopnotchers } from "@/lib/queries";

export async function GET(req: NextRequest) {
  return withRateLimit(req, { bucket: "topnotchers" }, async () => {
    try {
      const sp = req.nextUrl.searchParams;
      return json(
        await listTopnotchers({
          examCode: sp.get("exam_code") ?? undefined,
          year: sp.get("year") ? Number(sp.get("year")) : undefined,
          school: sp.get("school") ?? undefined,
          limit: Math.min(200, Number(sp.get("limit") ?? 50) || 50),
        }),
      );
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

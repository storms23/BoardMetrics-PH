import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { regionalAnalytics } from "@/lib/queries";

export async function GET(req: NextRequest) {
  return withRateLimit(req, { bucket: "regions" }, async () => {
    try {
      const sp = req.nextUrl.searchParams;
      return json(
        await regionalAnalytics(
          sp.get("exam_code") ?? undefined,
          sp.get("year") ? Number(sp.get("year")) : undefined,
        ),
      );
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

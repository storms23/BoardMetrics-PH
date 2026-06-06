import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { examTopSchools } from "@/lib/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  return withRateLimit(req, { bucket: "exams" }, async () => {
    try {
      const sp = req.nextUrl.searchParams;
      const year = sp.get("year") ? Number(sp.get("year")) : undefined;
      const month = sp.get("month") ?? undefined;
      const limit = Math.min(100, Number(sp.get("limit") ?? 20) || 20);
      return json(await examTopSchools(code, year, month, limit));
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

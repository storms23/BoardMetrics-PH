import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { getExamHistory } from "@/lib/queries";
import { getProgramByCode } from "@/lib/programs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!getProgramByCode(code)) {
    return apiError(404, "unknown_exam", `Unknown exam code '${code}'.`);
  }
  return withRateLimit(req, { bucket: "exams" }, async () => {
    try {
      const sp = req.nextUrl.searchParams;
      const year = sp.get("year") ? Number(sp.get("year")) : undefined;
      const month = sp.get("month") ?? undefined;
      const data = await getExamHistory(code, year, month);
      if (!data.length) {
        return apiError(404, "no_data", `No data found for exam '${code}'.`);
      }
      return json(data);
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

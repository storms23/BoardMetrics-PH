import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { compareSchools } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ids = (sp.get("school_ids") ?? "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) {
    return apiError(400, "bad_ids", "Provide comma-separated school_ids, e.g. 1,2,3.");
  }
  return withRateLimit(req, { bucket: "compare" }, async () => {
    try {
      return json(await compareSchools(ids, sp.get("exam_code") ?? undefined));
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

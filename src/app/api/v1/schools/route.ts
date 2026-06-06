import { NextRequest } from "next/server";
import { json, apiError, withRateLimit, getPagination } from "@/lib/http";
import { listSchools } from "@/lib/queries";

export async function GET(req: NextRequest) {
  return withRateLimit(req, { bucket: "schools" }, async () => {
    try {
      const { page, perPage } = getPagination(req);
      const sp = req.nextUrl.searchParams;
      const result = await listSchools({
        search: sp.get("search") ?? undefined,
        region: sp.get("region") ?? undefined,
        page,
        perPage,
      });
      return json(result);
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

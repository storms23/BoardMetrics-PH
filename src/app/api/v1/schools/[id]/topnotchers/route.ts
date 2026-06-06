import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { schoolTopnotchers } from "@/lib/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const schoolId = Number(id);
  if (!Number.isInteger(schoolId) || schoolId < 1) {
    return apiError(400, "bad_id", "School id must be a positive integer.");
  }
  return withRateLimit(req, { bucket: "schools" }, async () => {
    try {
      const result = await schoolTopnotchers(schoolId);
      if (!result) return apiError(404, "not_found", "School not found.");
      return json(result);
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

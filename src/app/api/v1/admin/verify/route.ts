import { NextRequest } from "next/server";
import { json, apiError, hasValidApiKey } from "@/lib/http";
import { runVerification } from "@/lib/admin";

/** Programmatic data-verification report. Requires a valid admin API key. */
export async function GET(req: NextRequest) {
  if (!hasValidApiKey(req)) {
    return apiError(401, "unauthorized", "A valid X-API-Key is required.");
  }
  try {
    return json(await runVerification());
  } catch (e) {
    return apiError(500, "server_error", (e as Error).message);
  }
}

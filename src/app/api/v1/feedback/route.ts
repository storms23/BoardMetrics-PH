import { NextRequest } from "next/server";
import { json, apiError, withRateLimit } from "@/lib/http";
import { isSupabaseConfigured, getServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  return withRateLimit(req, { bucket: "feedback", limit: 8, windowMs: 60_000 }, async () => {
    if (!isSupabaseConfigured()) {
      return apiError(503, "not_configured", "Feedback is not available right now.");
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError(400, "bad_json", "Request body must be JSON.");
    }

    const { name, email, message } = body as {
      name?: string;
      email?: string;
      message?: string;
    };

    const trimmed = (message ?? "").trim();
    if (trimmed.length < 10) {
      return apiError(400, "bad_message", "Message must be at least 10 characters.");
    }
    if (trimmed.length > 4000) {
      return apiError(400, "bad_message", "Message is too long (max 4000 characters).");
    }

    const cleanName = (name ?? "").trim().slice(0, 120) || null;
    const cleanEmail = (email ?? "").trim().slice(0, 200) || null;
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return apiError(400, "bad_email", "Email address looks invalid.");
    }

    try {
      const sb = getServiceClient();
      const { error } = await sb.from("creator_feedback").insert({
        name: cleanName,
        email: cleanEmail,
        message: trimmed,
      });
      if (error) {
        return apiError(500, "db_error", error.message);
      }
      return json({ ok: true });
    } catch (e) {
      return apiError(500, "server_error", (e as Error).message);
    }
  });
}

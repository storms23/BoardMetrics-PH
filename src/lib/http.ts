import { NextRequest, NextResponse } from "next/server";

/** JSON success response. */
export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/** JSON error response in a consistent shape. */
export function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Parse pagination params with sane caps (NFR/API conventions). */
export function getPagination(req: NextRequest): { page: number; perPage: number } {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const perPage = Math.min(100, Math.max(1, Number(sp.get("per_page") ?? 20) || 20));
  return { page, perPage };
}

/** Parse `sort=field.dir` (e.g., pass_rate.desc) against an allow-list. */
export function getSort(
  req: NextRequest,
  allowed: string[],
  fallback: { column: string; ascending: boolean },
): { column: string; ascending: boolean } {
  const raw = req.nextUrl.searchParams.get("sort");
  if (!raw) return fallback;
  const [column, dir] = raw.split(".");
  if (!allowed.includes(column)) return fallback;
  return { column, ascending: dir !== "desc" };
}

/**
 * Minimal in-memory rate limiter (per IP + bucket). Good enough for the MVP on a
 * single instance. For multi-instance/serverless production, swap for Upstash
 * Redis or the Supabase rate-limit table — the call site stays the same.
 */
const BUCKETS = new Map<string, { count: number; reset: number }>();

export function rateLimit(
  req: NextRequest,
  { limit = 60, windowMs = 60_000, bucket = "default" } = {},
): { ok: boolean; retryAfter: number } {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = BUCKETS.get(key);

  if (!entry || now > entry.reset) {
    BUCKETS.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { ok: false, retryAfter: Math.ceil((entry.reset - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Returns true if the request carries a valid admin/partner API key. */
export function hasValidApiKey(req: NextRequest): boolean {
  const key =
    req.headers.get("x-api-key") ||
    req.nextUrl.searchParams.get("api_key") ||
    "";
  if (!key) return false;
  const allowed = (process.env.ADMIN_API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return allowed.includes(key);
}

/**
 * Wrap a handler with rate limiting; returns 429 with Retry-After on exceed.
 * Requests with a valid API key get a 10x higher limit (partner tier).
 */
export async function withRateLimit(
  req: NextRequest,
  opts: { limit?: number; windowMs?: number; bucket?: string },
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const baseLimit = opts.limit ?? 60;
  const limit = hasValidApiKey(req) ? baseLimit * 10 : baseLimit;
  const { ok, retryAfter } = rateLimit(req, { ...opts, limit });
  if (!ok) {
    const res = apiError(429, "rate_limited", "Too many requests. Please slow down.");
    res.headers.set("Retry-After", String(retryAfter));
    return res;
  }
  const out = await handler();
  out.headers.set("X-RateLimit-Limit", String(limit));
  return out;
}

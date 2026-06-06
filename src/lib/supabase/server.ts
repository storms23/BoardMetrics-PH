import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** True when public Supabase env vars are present (used to degrade gracefully). */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Server-side Supabase clients. NEVER import these into client components.
 *
 * - getServerClient(): anon key, for public read queries in server components
 *   and API route handlers.
 * - getServiceClient(): service-role key, bypasses RLS. Use ONLY for trusted
 *   server work (ETL ingestion, admin writes). Never expose to the browser.
 */

export function getServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Copy .env.example to .env.local and fill them in.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. This server-only key is required for admin/ETL writes.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

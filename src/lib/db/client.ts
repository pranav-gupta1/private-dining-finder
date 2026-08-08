import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase access.
 *
 * Route handlers use the service-role client because searches write to the
 * commute and geocode caches. Nothing in `src/components` imports this file.
 *
 * When the environment is not configured the accessors return null rather than
 * throwing, and the data layer falls back to the committed snapshot in
 * `src/data`. That keeps `git clone && npm run dev` working for a reviewer who
 * has not stood up a Supabase project yet, without pretending the database is
 * optional in production.
 */

let cached: SupabaseClient | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function getServerClient(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey ?? anonKey;

  if (!url || !key) return null;

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "private-dining-finder" } },
  });

  return cached;
}

/** True when we hold the service role key and may therefore write caches. */
export function canWriteCaches(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

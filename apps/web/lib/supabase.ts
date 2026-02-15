import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

/** Server-side Supabase client (service role). Lazy-init so build can run without env. */
export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.STORAGE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("STORAGE_SUPABASE_URL and STORAGE_SUPABASE_SERVICE_ROLE_KEY are required");
  _supabase = createClient(url, key);
  return _supabase;
}

import "server-only";
import { createClient } from "@supabase/supabase-js";

let _client = null;

export function getSupabaseAdmin() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars manquants");
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

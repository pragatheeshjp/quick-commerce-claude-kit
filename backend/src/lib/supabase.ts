import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Service-role client: bypasses RLS. Use only in server code, only where privileged access is needed.
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

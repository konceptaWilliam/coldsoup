import { createClient } from "@supabase/supabase-js";

function make() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Stateless (no session), so one instance per server process is safe and
// saves re-creating the client in every procedure.
let admin: ReturnType<typeof make> | null = null;

export function createAdminClient() {
  return (admin ??= make());
}

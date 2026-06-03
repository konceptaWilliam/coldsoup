import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Memoized singleton. Every component shares ONE client so there is a single
// realtime socket whose auth token is kept fresh by the auth listener in
// providers.tsx. Creating a fresh client per call opened anonymous realtime
// sockets that RLS then filtered — postgres_changes events never arrived.
let browserClient: SupabaseClient | undefined;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return browserClient;
}

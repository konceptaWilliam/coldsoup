import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

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

// Dedicated realtime client for presence (typing indicator). Kept on its OWN
// socket and never auth-churned: the main client's setAuth() flips the shared
// socket anon->user, forcing every channel to rejoin, which orphans presence
// refs (duplicate locally, empty meta on peers). Presence here is a public
// channel and works fine with the anon key, so this socket stays stable.
let presenceClient: SupabaseClient | undefined;

export function getPresenceClient() {
  if (presenceClient) return presenceClient;
  presenceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
  return presenceClient;
}

// Idempotent realtime auth. Calling realtime.setAuth() unconditionally
// re-pushes the token and forces every channel to rejoin, which resets
// presence state (typing indicator) and duplicates tracks. Only update when
// the token actually changed.
export function setRealtimeAuth(client: SupabaseClient, token: string | null) {
  const current = (client.realtime as unknown as { accessTokenValue?: string | null })
    .accessTokenValue;
  if (current === token) return;
  client.realtime.setAuth(token);
}

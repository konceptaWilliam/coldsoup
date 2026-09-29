import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

function parseCookies(cookieHeader: string) {
  if (!cookieHeader) return [];
  return cookieHeader.split(";").map((c) => {
    const [name, ...rest] = c.trim().split("=");
    return { name: name.trim(), value: rest.join("=").trim() };
  });
}

// Verifies mobile bearer tokens. One instance per process so the JWKS cache
// (10 min TTL inside auth-js) survives across requests on a warm lambda.
let anonClient: ReturnType<typeof createClient> | null = null;
function getAnonClient() {
  return (anonClient ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  ));
}

export type AuthUser = { id: string; email: string | null };

export async function createContext({ req }: FetchCreateContextFnOptions) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    bearerToken
      ? {
          cookies: { getAll: () => [], setAll: () => {} },
          global: { headers: { Authorization: `Bearer ${bearerToken}` } },
        }
      : {
          cookies: {
            getAll() { return parseCookies(cookieHeader); },
            setAll() {},
          },
        }
  );

  // getClaims() verifies the JWT locally against the project's ECC signing
  // key (JWKS fetched once, then cached) instead of a network round trip to
  // the Auth server on every request.
  let user: AuthUser | null = null;
  try {
    const { data } = bearerToken
      ? await getAnonClient().auth.getClaims(bearerToken)
      : await supabase.auth.getClaims();
    const claims = data?.claims;
    if (claims?.sub) {
      user = { id: claims.sub, email: (claims.email as string | undefined) ?? null };
    }
  } catch {
    user = null;
  }

  // Loaded only by procedures that need more than the user id.
  let profilePromise: Promise<Profile | null> | null = null;
  const getProfile = (): Promise<Profile | null> => {
    if (!user) return Promise.resolve(null);
    const userId = user.id;
    return (profilePromise ??= (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, email, avatar_url, created_at")
        .eq("id", userId)
        .single();
      return (data as Profile | null) ?? null;
    })());
  };

  return { supabase, user, getProfile };
}

export type Profile = {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
};

export type Context = Awaited<ReturnType<typeof createContext>>;

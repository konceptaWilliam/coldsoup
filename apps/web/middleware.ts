import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PW_OK_COOKIE, needsPasswordCheck } from "@/lib/password-gate";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const isDocumentNav = request.headers.get("accept")?.includes("text/html") ?? false;

  // Refresh session — do not remove. Document navigations (app open, reload)
  // do a real Auth round trip so revoked sessions are caught; everything else
  // verifies the JWT locally (getClaims still refreshes an expired session).
  // Wrapped in try/catch so a paused/unreachable Supabase project doesn't log
  // everyone out.
  let userId: string | null = null;
  try {
    if (isDocumentNav) {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    } else {
      const { data } = await supabase.auth.getClaims();
      userId = (data?.claims?.sub as string | undefined) ?? null;
    }
  } catch {
    // Supabase unreachable — let request through, tRPC will surface the error
    return supabaseResponse;
  }

  const { pathname } = request.nextUrl;

  // Public paths that don't need auth
  const publicPaths = ["/login", "/auth/callback", "/auth/reset-password", "/invite", "/api/trpc", "/api/push", "/api/build"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  // Redirect unauthenticated users to login
  if (!userId && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login
  if (userId && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Force passwordless invited users (magic-link only, no password/OAuth) to set
  // a password before using the app. Only check on top-level document
  // navigations, skip the pages they need to finish setup, and skip entirely
  // once a passed check is cached in a cookie for this user.
  const passwordExempt =
    isPublic || pathname === "/onboarding" || pathname === "/auth/set-password";

  if (
    userId &&
    isDocumentNav &&
    !passwordExempt &&
    needsPasswordCheck(request.cookies.get(PW_OK_COOKIE)?.value, userId)
  ) {
    const admin = createAdminClient();
    const { data: needsPassword, error } = await admin.rpc("needs_password_setup", {
      uid: userId,
    });
    if (needsPassword) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/set-password";
      return NextResponse.redirect(url);
    }
    if (!error && needsPassword === false) {
      supabaseResponse.cookies.set(PW_OK_COOKIE, userId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  return supabaseResponse;
}

// Deliberately still runs on /api/trpc: this is where an expired session is
// refreshed AND the rotated cookies are written back to the browser. Route
// handlers can't persist cookies, so refreshing there would burn the refresh
// token and log the user out.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/lib/trpc/router";
import { createContext } from "@/lib/trpc/context";

// Origins allowed to call the API cross-origin. Localhost dev servers (Expo
// web) are only allowed outside production.
const ALLOWED_ORIGINS = new Set(
  [
    ...(process.env.NODE_ENV !== "production"
      ? ["http://localhost:8081", "http://localhost:19006"]
      : []),
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean) as string[]
);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const handler = async (req: Request) => {
  const res = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(`tRPC error on ${path ?? "<unknown>"}:`, error);
          }
        : undefined,
  });
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    res.headers.set(key, value);
  }
  return res;
};

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export { handler as GET, handler as POST };

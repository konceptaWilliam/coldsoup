// Sink for client-side diagnostics (see lib/response-diagnostics.ts). Writes
// to the function log so reports show up in Vercel logs next to the request
// they describe (match on `vercelId`). Auth is enforced by middleware.

const MAX_BYTES = 4096;

export async function POST(req: Request) {
  const text = (await req.text()).slice(0, MAX_BYTES);
  let details: unknown = text;
  try {
    details = JSON.parse(text);
  } catch {
    // Keep the raw (capped) text.
  }
  console.error("[client-log]", JSON.stringify(details));
  return new Response(null, { status: 204 });
}

// Public VAPID key for the service worker. The key is already exposed to the
// browser as NEXT_PUBLIC_VAPID_PUBLIC_KEY; this endpoint lets the SW read it at
// runtime (service workers can't access build-time env), so it can re-subscribe
// on `pushsubscriptionchange` even when the browser doesn't hand back the old
// subscription's applicationServerKey.
export const dynamic = "force-static";

export function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  return new Response(key, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

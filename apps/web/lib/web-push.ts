import "server-only";
import webpush from "web-push";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface WebPushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  tag?: string;
}

/**
 * Send a web push to a single subscription.
 * Returns `"gone"` if the endpoint is dead (404/410) and should be pruned.
 */
export async function sendWebPush(
  sub: WebPushSub,
  payload: WebPushPayload
): Promise<"ok" | "gone" | "error"> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return "ok";
  } catch (err: unknown) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    console.error("[webpush] send failed", e?.statusCode, e?.body ?? e?.message);
    if (e?.statusCode === 404 || e?.statusCode === 410) return "gone";
    return "error";
  }
}

/** Like sendWebPush but returns full detail — for the test/debug endpoint. */
export async function sendWebPushDebug(
  sub: WebPushSub,
  payload: WebPushPayload
): Promise<{ ok: boolean; statusCode?: number; body?: string; message?: string }> {
  try {
    ensureConfigured();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { ok: true, statusCode: res.statusCode };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    return { ok: false, statusCode: e?.statusCode, body: e?.body, message: e?.message };
  }
}

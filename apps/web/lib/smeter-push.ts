import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// Push to a set of users (Expo + Web Push), skipping paused recipients and,
// unless respectMutes is false, users who muted the thread or group.
// Shared by S-meter create/completion and the daily reminder cron.
// Best-effort — callers wrap in try.
export async function notifyParticipants(
  admin: AdminClient,
  recipients: string[],
  opts: {
    threadId: string;
    groupId: string;
    expoTitle: string;
    subtitle: string;
    expoBody: string;
    webTitle: string;
    webBody: string;
    tag: string;
    messageId?: string;
    respectMutes?: boolean;
  }
) {
  if (recipients.length === 0) return;

  const respectMutes = opts.respectMutes ?? true;
  const [{ data: profiles }, { data: muteRows }] = await Promise.all([
    admin.from("profiles").select("id, push_token, notifications_paused").in("id", recipients),
    respectMutes
      ? admin.from("mutes").select("user_id").in("user_id", recipients).in("target_id", [opts.threadId, opts.groupId])
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);
  const muted = new Set((muteRows ?? []).map((m) => m.user_id as string));
  const eligible = (profiles ?? []).filter(
    (p) => !muted.has(p.id as string) && !(p as { notifications_paused: boolean }).notifications_paused
  );
  const eligibleIds = eligible.map((p) => p.id as string);
  const data = {
    threadId: opts.threadId,
    groupId: opts.groupId,
    ...(opts.messageId ? { messageId: opts.messageId } : {}),
  };

  // Expo push (mobile). Awaited so a cron route doesn't return before it's sent.
  const tokens = eligible
    .map((p) => (p as { push_token: string | null }).push_token)
    .filter((tk): tk is string => Boolean(tk));
  if (tokens.length > 0) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        tokens.map((token) => ({ to: token, title: opts.expoTitle, subtitle: opts.subtitle, body: opts.expoBody, data }))
      ),
    }).catch(() => null);
  }

  // Web Push (PWA)
  if (eligibleIds.length > 0) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", eligibleIds);
    if (subs && subs.length > 0) {
      const { sendWebPush } = await import("@/lib/web-push");
      const payload = { title: opts.webTitle, body: opts.webBody, tag: opts.tag, data };
      const results = await Promise.all(
        subs.map((s) =>
          sendWebPush(
            { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string },
            payload
          ).then((r) => ({ endpoint: s.endpoint as string, r }))
        )
      );
      const dead = results.filter((x) => x.r === "gone").map((x) => x.endpoint);
      if (dead.length > 0) await admin.from("push_subscriptions").delete().in("endpoint", dead);
    }
  }
}

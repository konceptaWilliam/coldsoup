// Daily push for every unanswered S-meter (see vercel.json crons: 07 and 08 UTC,
// only the run at 09 Europe/Stockholm acts). One push per S-meter to its
// pending users; tag per S-meter so today's replaces yesterday's.
// Vercel sends `Authorization: Bearer $CRON_SECRET`.
// Manual check: curl -H "Authorization: Bearer $CRON_SECRET" \
//   "https://<host>/api/cron/smeter-reminders?dryRun=1"   (list, no push)
//   "https://<host>/api/cron/smeter-reminders?force=1"    (send now)

import { createAdminClient } from "@/lib/supabase/admin";
import { notifyParticipants } from "@/lib/smeter-push";
import {
  REMINDER_TITLE,
  isStockholmHour,
  reminderBatches,
  type PendingRow,
} from "@/lib/smeter-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const dryRun = params.get("dryRun") === "1";
  const force = params.get("force") === "1";
  if (!dryRun && !force && !isStockholmHour(new Date(), 9)) {
    return Response.json({ skipped: "not 09 in Europe/Stockholm" });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("pending_smeters", { p_user: null });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as PendingRow[];
    const batches = reminderBatches(rows);
    const summary = {
      dryRun,
      pending: rows.length,
      users: new Set(rows.map((r) => r.user_id)).size,
      smeters: batches.length,
    };

    if (dryRun) {
      console.log("[smeter-reminders]", JSON.stringify(summary));
      return Response.json({ ...summary, batches });
    }

    let failed = 0;
    for (const b of batches) {
      try {
        await notifyParticipants(admin, b.userIds, {
          threadId: b.threadId,
          groupId: b.groupId,
          messageId: b.messageId,
          expoTitle: REMINDER_TITLE,
          subtitle: b.location,
          expoBody: b.expoBody,
          webTitle: REMINDER_TITLE,
          webBody: b.webBody,
          tag: `smeter-reminder-${b.smeterId}`,
          respectMutes: false,
        });
      } catch {
        failed++;
      }
    }

    console.log("[smeter-reminders]", JSON.stringify({ ...summary, failed }));
    return Response.json({ ...summary, failed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[smeter-reminders] failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

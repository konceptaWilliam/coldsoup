// Daily cleanup of attachment files no live message references (see
// vercel.json crons). Vercel sends `Authorization: Bearer $CRON_SECRET`.
// Manual check: curl -H "Authorization: Bearer $CRON_SECRET" \
//   "https://<host>/api/cron/sweep-attachments?dryRun=1"

import { createAdminClient } from "@/lib/supabase/admin";
import { sweepAttachments } from "@/lib/attachment-sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try {
    const result = await sweepAttachments(
      createAdminClient(),
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      { dryRun },
    );
    const { largest, ...summary } = result;
    console.log("[sweep-attachments]", JSON.stringify({ dryRun, ...summary }));
    return Response.json({ dryRun, ...summary, largest });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sweep-attachments] failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

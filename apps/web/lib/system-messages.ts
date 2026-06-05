// Server helper: insert a system message (no author) and bump the thread so it
// sorts to the top of the list. Used by the thread + S-meter mutations.
import { createAdminClient } from "@/lib/supabase/admin";
import type { SystemEvent } from "@coldsoup/core";
import { systemEventText } from "@/lib/system-event";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function postSystemMessage(admin: AdminClient, threadId: string, event: SystemEvent) {
  const { data } = await admin
    .from("messages")
    .insert({ thread_id: threadId, user_id: null, body: systemEventText(event), system_event: event })
    .select("id")
    .single();
  await admin.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
  return data;
}

import { TRPCError } from "@trpc/server";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type ThreadAccess = {
  id: string;
  group_id: string;
  title: string;
  status: "OPEN" | "URGENT" | "DONE";
  updated_at: string;
  last_read_at: string | null;
};

// One round trip: thread row + membership check + caller's read marker.
// Not found and not a member both surface as NOT_FOUND (no existence leak).
export async function assertThreadAccess(
  admin: Admin,
  threadId: string,
  userId: string
): Promise<ThreadAccess> {
  const { data, error } = await admin.rpc("thread_access", {
    p_thread: threadId,
    p_user: userId,
  });
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  const row = (data as ThreadAccess[] | null)?.[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

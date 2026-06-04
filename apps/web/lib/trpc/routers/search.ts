import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";

export const searchRouter = router({
  query: protectedProcedure
    .input(
      z.object({
        q: z.string().min(2).max(200),
        groupId: z.string().uuid().optional(),
        threadId: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();
      const q = input.q.trim();

      // Get all group IDs this user belongs to
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", profile.id);

      const allGroupIds = (memberships ?? []).map((m) => m.group_id);
      if (allGroupIds.length === 0) return { threads: [], messages: [] };

      // Scope to selected group if provided (and user is a member)
      const groupIds = input.groupId
        ? allGroupIds.filter((id) => id === input.groupId)
        : allGroupIds;
      if (groupIds.length === 0) return { threads: [], messages: [] };

      // If a specific thread is selected, skip thread-title search and search only that thread's messages
      let threads: Array<{ id: string; title: string; status: string; group_id: string; groups: unknown }> = [];
      let threadIds: string[] = [];

      if (input.threadId) {
        // Verify the thread is in one of the caller's groups before searching
        // it — otherwise this would read messages from any group (IDOR).
        const { data: t } = await admin
          .from("threads")
          .select("group_id")
          .eq("id", input.threadId)
          .in("group_id", groupIds)
          .maybeSingle();
        if (!t) return { threads: [], messages: [] };
        threadIds = [input.threadId];
      } else {
        // Search thread titles
        const { data, error: te } = await admin
          .from("threads")
          .select("id, title, status, group_id, groups(name)")
          .in("group_id", groupIds)
          .ilike("title", `%${q}%`)
          .order("updated_at", { ascending: false })
          .limit(8);

        if (te) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: te.message });
        threads = data ?? [];

        // All thread IDs in scope for message search
        const { data: allThreads } = await admin
          .from("threads")
          .select("id")
          .in("group_id", groupIds);
        threadIds = (allThreads ?? []).map((t) => t.id);
      }

      // Search message bodies
      const { data: messages, error: me } = await admin
        .from("messages")
        .select("id, body, created_at, thread_id, threads(id, title, group_id, groups(name))")
        .in("thread_id", threadIds)
        .ilike("body", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(15);

      if (me) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: me.message });

      return {
        threads: (threads ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status as "OPEN" | "URGENT" | "DONE",
          groupId: t.group_id,
          groupName: (t.groups as unknown as { name: string } | null)?.name ?? "",
        })),
        messages: (messages ?? [])
          .filter((m) => m.threads)
          .map((m) => {
            const thread = m.threads as unknown as {
              id: string;
              title: string;
              group_id: string;
              groups: { name: string } | null;
            };
            return {
              id: m.id,
              body: m.body,
              threadId: thread.id,
              threadTitle: thread.title,
              groupId: thread.group_id,
              groupName: thread.groups?.name ?? "",
            };
          }),
      };
    }),
});

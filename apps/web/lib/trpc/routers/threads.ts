import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { postSystemMessage } from "@/lib/system-messages";

const threadStatusSchema = z.enum(["OPEN", "URGENT", "DONE"]);

export const threadsRouter = router({
  list: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;

      // Verify user is member of this group
      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", input.groupId)
        .eq("user_id", profile.id)
        .single();

      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });
      }

      const { data, error } = await supabase
        .from("threads")
        .select(
          `id, title, status, created_at, updated_at, group_id, created_by, due_date,
           creator:profiles!threads_created_by_fkey(id, display_name, avatar_url),
           messages(body, attachments, poll_id, smeter_id, is_deleted, created_at, user_id, profiles(display_name), smeters(title))`
        )
        .eq("group_id", input.groupId)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false, foreignTable: "messages" })
        .limit(1, { foreignTable: "messages" });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      // Blank the body/attachments of a deleted last message so its content
      // never reaches the client (the UI shows a "deleted" placeholder).
      for (const th of data ?? []) {
        const msgs = (th as { messages?: { body: string; attachments: unknown; is_deleted: boolean }[] }).messages;
        for (const m of msgs ?? []) {
          if (m.is_deleted) {
            m.body = "";
            m.attachments = [];
          }
        }
      }

      return data ?? [];
    }),

  get: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: thread } = await supabase
        .from("threads")
        .select("group_id")
        .eq("id", input.threadId)
        .single();
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await admin
        .from("threads")
        .select(
          `id, title, status, group_id, created_by, due_date,
           creator:profiles!threads_created_by_fkey(id, display_name, avatar_url)`
        )
        .eq("id", input.threadId)
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return data;
    }),

  setMeta: protectedProcedure
    .input(
      z.object({
        threadId: z.string().uuid(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: thread } = await supabase
        .from("threads")
        .select("group_id, due_date")
        .eq("id", input.threadId)
        .single();
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      if (input.dueDate === undefined) return { success: true };

      const previousDue = (thread.due_date as string | null) ?? null;

      const { error } = await admin
        .from("threads")
        .update({ due_date: input.dueDate })
        .eq("id", input.threadId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      if ((input.dueDate ?? null) !== previousDue) {
        await postSystemMessage(admin, input.threadId, {
          kind: "due_date",
          actorName: profile.display_name,
          dueDate: input.dueDate ?? null,
        });
      }

      return { success: true };
    }),

  // Rename a thread. Any group member can rename — threads are shared, not owned.
  rename: protectedProcedure
    .input(
      z.object({
        threadId: z.string().uuid(),
        title: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: thread } = await supabase
        .from("threads")
        .select("group_id, title")
        .eq("id", input.threadId)
        .single();
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const title = input.title.trim();
      if (!title) throw new TRPCError({ code: "BAD_REQUEST", message: "Title required" });

      const previousTitle = (thread.title as string | null) ?? "";
      if (title === previousTitle) return { success: true };

      const { error } = await admin
        .from("threads")
        .update({ title })
        .eq("id", input.threadId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      await postSystemMessage(admin, input.threadId, {
        kind: "thread_renamed",
        actorName: profile.display_name,
        from: previousTitle,
        to: title,
      });

      return { success: true };
    }),

  create: protectedProcedure
    .input(
      z.object({
        groupId: z.string().uuid(),
        title: z.string().min(1).max(200),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      // Verify membership using user's client (respects RLS)
      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", input.groupId)
        .eq("user_id", profile.id)
        .single();

      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { data, error } = await admin
        .from("threads")
        .insert({
          group_id: input.groupId,
          title: input.title,
          status: "OPEN",
          created_by: profile.id,
          due_date: input.dueDate ?? null,
        })
        .select()
        .single();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      await postSystemMessage(admin, data.id, { kind: "thread_created", actorName: profile.display_name });

      return data;
    }),

  delete: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: thread } = await supabase
        .from("threads")
        .select("group_id")
        .eq("id", input.threadId)
        .single();

      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();

      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { error } = await admin
        .from("threads")
        .delete()
        .eq("id", input.threadId);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { success: true };
    }),

  markRead: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: thread } = await supabase
        .from("threads")
        .select("group_id")
        .eq("id", input.threadId)
        .single();
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const { error } = await admin
        .from("thread_reads")
        .upsert(
          { thread_id: input.threadId, user_id: profile.id, last_read_at: new Date().toISOString() },
          { onConflict: "thread_id,user_id" }
        );
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return { success: true };
    }),

  // Per-thread unread message counts for the thread-list badge. `since` is the
  // client's persisted lastSeen baseline ({ threadId: epochMs }); the server
  // counts messages newer than it, excluding the caller's own and deleted ones.
  unreadCounts: protectedProcedure
    .input(
      z.object({
        groupId: z.string().uuid(),
        since: z.record(z.string().uuid(), z.number()),
      })
    )
    .query(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", input.groupId)
        .eq("user_id", profile.id)
        .single();
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const admin = createAdminClient();
      const { data, error } = await admin.rpc("thread_unread_counts", {
        p_user: profile.id,
        p_group: input.groupId,
        p_since: input.since,
      });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const result: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ thread_id: string; cnt: number }>) {
        result[row.thread_id] = Number(row.cnt);
      }
      return result;
    }),

  reads: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: thread } = await supabase
        .from("threads")
        .select("group_id")
        .eq("id", input.threadId)
        .single();
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await admin
        .from("thread_reads")
        .select("user_id, last_read_at, profiles(id, display_name, avatar_url)")
        .eq("thread_id", input.threadId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return (data ?? []).map((r) => {
        const p = r.profiles as unknown as { id: string; display_name: string; avatar_url: string | null } | null;
        return {
          user_id: r.user_id as string,
          last_read_at: r.last_read_at as string,
          display_name: p?.display_name ?? "Unknown",
          avatar_url: p?.avatar_url ?? null,
        };
      });
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        threadId: z.string().uuid(),
        status: threadStatusSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      // Verify membership using user's client
      const { data: thread } = await supabase
        .from("threads")
        .select("group_id, status")
        .eq("id", input.threadId)
        .single();

      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();

      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const fromStatus = thread.status as "OPEN" | "URGENT" | "DONE";

      const { data, error } = await admin
        .from("threads")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", input.threadId)
        .select()
        .single();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      if (fromStatus !== input.status) {
        await postSystemMessage(admin, input.threadId, {
          kind: "status",
          actorName: profile.display_name,
          from: fromStatus,
          to: input.status,
        });
      }

      return data;
    }),
});

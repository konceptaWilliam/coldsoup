import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";

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
           messages(body, is_deleted, created_at, user_id, profiles(display_name))`
        )
        .eq("group_id", input.groupId)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false, foreignTable: "messages" })
        .limit(1, { foreignTable: "messages" });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
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

      if (input.dueDate === undefined) return { success: true };

      const { error } = await admin
        .from("threads")
        .update({ due_date: input.dueDate })
        .eq("id", input.threadId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

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

      const { data, error } = await admin
        .from("threads")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", input.threadId)
        .select()
        .single();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return data;
    }),
});

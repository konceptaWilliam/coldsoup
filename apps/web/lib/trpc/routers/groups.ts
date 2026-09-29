import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { toGroupList, GROUP_LIST_SELECT } from "@/lib/group-list";
import { toUnreadMap, type UnreadMap } from "@/lib/server-shapes";

async function assertGroupAdmin(groupId: string, userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .single();
  if (!data || data.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Group admin access required" });
  }
}

export const groupsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { supabase, profile } = ctx;

    const { data, error } = await supabase
      .from("group_memberships")
      .select(GROUP_LIST_SELECT)
      .eq("user_id", profile.id)
      // Caller's chosen order; never-reordered groups fall to the bottom.
      .order("sort_order", { ascending: true, nullsFirst: false });

    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }

    return toGroupList(data ?? []);
  }),

  // Persist the caller's sidebar group order. Only touches the caller's own
  // membership rows, so each member arranges their own list.
  reorder: protectedProcedure
    .input(z.object({ groupIds: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      const results = await Promise.all(
        input.groupIds.map((groupId, i) =>
          admin
            .from("group_memberships")
            .update({ sort_order: i })
            .eq("user_id", profile.id)
            .eq("group_id", groupId)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: failed.error.message });
      }

      return { success: true };
    }),

  // Per-group unread counts for the sidebar dots. A thread is "unread" when its
  // updated_at (bumped on every new message) is newer than the caller's
  // thread_reads marker for it.
  unread: protectedProcedure.query(async ({ ctx }): Promise<UnreadMap> => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("groups_unread", { p_user: ctx.profile.id });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return toUnreadMap((data ?? []) as { group_id: string; unread: number; urgent: number }[]);
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      const { data, error } = await admin
        .from("groups")
        .insert({ name: input.name, created_by: profile.id })
        .select()
        .single();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      await admin.from("group_memberships").insert({
        group_id: data.id,
        user_id: profile.id,
        role: "ADMIN",
      });

      return data;
    }),

  rename: protectedProcedure
    .input(z.object({ groupId: z.string().uuid(), name: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupAdmin(input.groupId, ctx.profile.id);
      const admin = createAdminClient();

      const { error } = await admin
        .from("groups")
        .update({ name: input.name })
        .eq("id", input.groupId);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { success: true };
    }),

  leave: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      const { error } = await admin
        .from("group_memberships")
        .delete()
        .eq("group_id", input.groupId)
        .eq("user_id", profile.id);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { success: true };
    }),

  removeMember: protectedProcedure
    .input(z.object({ groupId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupAdmin(input.groupId, ctx.profile.id);
      const admin = createAdminClient();

      const { error } = await admin
        .from("group_memberships")
        .delete()
        .eq("group_id", input.groupId)
        .eq("user_id", input.userId);

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { success: true };
    }),

  transferAdmin: protectedProcedure
    .input(z.object({ groupId: z.string().uuid(), newAdminId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertGroupAdmin(input.groupId, ctx.profile.id);
      const admin = createAdminClient();

      // Promote first and require that it actually matched a member — otherwise
      // demoting the caller would leave the group without an admin.
      const { data: promoted, error: promoteErr } = await admin
        .from("group_memberships")
        .update({ role: "ADMIN" })
        .eq("group_id", input.groupId)
        .eq("user_id", input.newAdminId)
        .select("user_id");
      if (promoteErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: promoteErr.message });
      if (!promoted || promoted.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "New admin must be a member of the group" });
      }

      // Demote current admin
      await admin
        .from("group_memberships")
        .update({ role: "MEMBER" })
        .eq("group_id", input.groupId)
        .eq("user_id", ctx.profile.id);

      return { success: true };
    }),
});

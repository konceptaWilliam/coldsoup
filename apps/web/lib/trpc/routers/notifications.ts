import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";

const targetTypeSchema = z.enum(["thread", "group"]);

export const notificationsRouter = router({
  // The caller's current mutes + global pause flag.
  prefs: protectedProcedure.query(async ({ ctx }) => {
    const { profile } = ctx;
    const admin = createAdminClient();

    const [{ data: muteRows }, { data: prof }] = await Promise.all([
      admin.from("mutes").select("target_type, target_id").eq("user_id", profile.id),
      admin.from("profiles").select("notifications_paused").eq("id", profile.id).single(),
    ]);

    return {
      paused: !!prof?.notifications_paused,
      threadIds: (muteRows ?? []).filter((m) => m.target_type === "thread").map((m) => m.target_id as string),
      groupIds: (muteRows ?? []).filter((m) => m.target_type === "group").map((m) => m.target_id as string),
    };
  }),

  setMute: protectedProcedure
    .input(z.object({ targetType: targetTypeSchema, targetId: z.string().uuid(), muted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      if (input.muted) {
        const { error } = await admin
          .from("mutes")
          .upsert(
            { user_id: profile.id, target_type: input.targetType, target_id: input.targetId },
            { onConflict: "user_id,target_type,target_id" }
          );
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      } else {
        const { error } = await admin
          .from("mutes")
          .delete()
          .eq("user_id", profile.id)
          .eq("target_type", input.targetType)
          .eq("target_id", input.targetId);
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { success: true };
    }),

  setPaused: protectedProcedure
    .input(z.object({ paused: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();
      const { error } = await admin
        .from("profiles")
        .update({ notifications_paused: input.paused })
        .eq("id", profile.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Register a browser Web Push subscription for the caller.
  subscribeWebPush: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
        userAgent: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();
      const { error } = await admin.from("push_subscriptions").upsert(
        {
          user_id: profile.id,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          user_agent: input.userAgent ?? null,
        },
        { onConflict: "endpoint" }
      );
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  unsubscribeWebPush: protectedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();
      const { error } = await admin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", profile.id)
        .eq("endpoint", input.endpoint);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Mirrors the messages.send fan-out for a thread and RETURNS what it finds,
  // so we can see eligibility + send results without Vercel logs.
  debugSend: protectedProcedure
    .input(z.object({ threadId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      const { data: thread } = await admin
        .from("threads")
        .select("group_id")
        .eq("id", input.threadId)
        .single();
      if (!thread) return { error: "thread not found" };

      const { data: members } = await admin
        .from("group_memberships")
        .select("user_id, profiles(notifications_paused)")
        .eq("group_id", thread.group_id)
        .neq("user_id", profile.id);

      const memberIds = (members ?? []).map((m) => m.user_id as string);
      const { data: muteRows } = memberIds.length > 0
        ? await admin.from("mutes").select("user_id").in("user_id", memberIds).in("target_id", [input.threadId, thread.group_id])
        : { data: [] as { user_id: string }[] };
      const mutedUserIds = new Set((muteRows ?? []).map((m) => m.user_id as string));

      const eligible = (members ?? []).filter((m) => {
        if (mutedUserIds.has(m.user_id as string)) return false;
        const prof = m.profiles as unknown as { notifications_paused: boolean } | null;
        return !prof?.notifications_paused;
      });
      const eligibleUserIds = eligible.map((m) => m.user_id as string);

      const { data: subs } = eligibleUserIds.length > 0
        ? await admin.from("push_subscriptions").select("endpoint, p256dh, auth, user_id").in("user_id", eligibleUserIds)
        : { data: [] as { endpoint: string; p256dh: string; auth: string; user_id: string }[] };

      const { sendWebPushDebug } = await import("@/lib/web-push");
      const results = await Promise.all(
        (subs ?? []).map(async (s) => {
          const r = await sendWebPushDebug(
            { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string },
            { title: "Debug", body: "Fan-out test", data: {} }
          );
          return { user_id: s.user_id, host: new URL(s.endpoint as string).host, ...r };
        })
      );

      return {
        groupId: thread.group_id,
        sender: profile.id,
        memberIds,
        eligibleUserIds,
        subsFound: (subs ?? []).length,
        results,
      };
    }),

  // Sends a push to the caller's OWN subscriptions and returns per-endpoint
  // results (status codes / errors). Diagnostic — bypasses Vercel log issues.
  testPush: protectedProcedure.mutation(async ({ ctx }) => {
    const { profile } = ctx;
    const admin = createAdminClient();
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", profile.id);

    const vapidConfigured = Boolean(process.env.VAPID_PRIVATE_KEY && process.env.VAPID_PUBLIC_KEY);
    if (!subs || subs.length === 0) {
      return { vapidConfigured, subscriptions: 0, results: [] as unknown[] };
    }

    const { sendWebPushDebug } = await import("@/lib/web-push");
    const results = await Promise.all(
      subs.map(async (s) => {
        const r = await sendWebPushDebug(
          { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string },
          { title: "Coldsoup", body: "Test notification ✅", data: {} }
        );
        return { host: new URL(s.endpoint as string).host, ...r };
      })
    );
    return { vapidConfigured, subscriptions: subs.length, results };
  }),
});

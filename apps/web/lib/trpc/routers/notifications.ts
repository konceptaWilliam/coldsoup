import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";

const targetTypeSchema = z.enum(["thread", "group"]);
const levelSchema = z.enum(["ALL", "MENTIONS", "NONE"]);

export const notificationsRouter = router({
  // The caller's current mutes, per-group levels + global pause flag.
  prefs: protectedProcedure.query(async ({ ctx }) => {
    const { profile } = ctx;
    const admin = createAdminClient();

    const [{ data: muteRows }, { data: levelRows }, { data: prof }] = await Promise.all([
      admin.from("mutes").select("target_type, target_id").eq("user_id", profile.id),
      admin.from("group_notification_prefs").select("group_id, level").eq("user_id", profile.id),
      admin.from("profiles").select("notifications_paused").eq("id", profile.id).single(),
    ]);

    const groupLevels: Record<string, "ALL" | "MENTIONS" | "NONE"> = {};
    for (const r of levelRows ?? []) {
      groupLevels[r.group_id as string] = r.level as "ALL" | "MENTIONS" | "NONE";
    }

    return {
      paused: !!prof?.notifications_paused,
      threadIds: (muteRows ?? []).filter((m) => m.target_type === "thread").map((m) => m.target_id as string),
      // Back-compat: "muted groups" = groups at level NONE (drives bell-off icons).
      groupIds: Object.entries(groupLevels)
        .filter(([, lvl]) => lvl === "NONE")
        .map(([id]) => id),
      groupLevels,
    };
  }),

  setMute: protectedProcedure
    .input(z.object({ targetType: targetTypeSchema, targetId: z.string().uuid(), muted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      // Group "mute" now maps onto the level model: muted = NONE, unmuted = ALL.
      if (input.targetType === "group") {
        const { error } = input.muted
          ? await admin.from("group_notification_prefs").upsert(
              { user_id: profile.id, group_id: input.targetId, level: "NONE" },
              { onConflict: "user_id,group_id" }
            )
          : await admin
              .from("group_notification_prefs")
              .delete()
              .eq("user_id", profile.id)
              .eq("group_id", input.targetId);
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return { success: true };
      }

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

  // Three-way per-group notification level. ALL is the default — stored as the
  // absence of a row so the table stays sparse.
  setGroupLevel: protectedProcedure
    .input(z.object({ groupId: z.string().uuid(), level: levelSchema }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      const { error } =
        input.level === "ALL"
          ? await admin
              .from("group_notification_prefs")
              .delete()
              .eq("user_id", profile.id)
              .eq("group_id", input.groupId)
          : await admin.from("group_notification_prefs").upsert(
              { user_id: profile.id, group_id: input.groupId, level: input.level },
              { onConflict: "user_id,group_id" }
            );
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

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

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
});

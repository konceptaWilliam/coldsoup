import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";

export const onboardingRouter = router({
  // Public: lets a freshly-authed user (who has no profile yet, so can't call
  // protectedProcedure) discover whether they still need to onboard.
  status: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return { authed: false, hasProfile: false };
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("id", ctx.user.id)
      .maybeSingle();
    return { authed: true, hasProfile: !!data };
  }),

  complete: publicProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(20),
        inviteToken: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const admin = createAdminClient();
      const userId = ctx.user.id;
      const email = ctx.user.email ?? "";

      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .single();

      if (existing) {
        return { success: true };
      }

      const { error: profileError } = await admin.from("profiles").insert({
        id: userId,
        display_name: input.displayName,
        email,
      });

      if (profileError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: profileError.message });
      }

      // Accept invite and create group memberships if applicable
      if (input.inviteToken) {
        const { data: invite } = await admin
          .from("invites")
          .select("*")
          .eq("token", input.inviteToken)
          .eq("accepted", false)
          .single();

        if (invite) {
          const memberships = (invite.group_ids as string[]).map((groupId: string) => ({
            group_id: groupId,
            user_id: userId,
          }));

          if (memberships.length > 0) {
            await admin.from("group_memberships").upsert(memberships, {
              onConflict: "group_id,user_id",
              ignoreDuplicates: true,
            });
          }

          await admin.from("invites").update({ accepted: true }).eq("id", invite.id);
        }
      }

      return { success: true };
    }),
});

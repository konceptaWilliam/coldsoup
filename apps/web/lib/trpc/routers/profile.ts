import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const { profile } = ctx;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("profiles")
      .select("id, display_name, email, avatar_url")
      .eq("id", profile.id)
      .maybeSingle();

    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }

    return data; // null when the user has no profile yet (new OAuth signup)
  }),

  update: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(20).optional(),
        avatarUrl: z.string().url().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      const updates: Record<string, unknown> = {};
      if (input.displayName !== undefined) updates.display_name = input.displayName;
      if (input.avatarUrl !== undefined) updates.avatar_url = input.avatarUrl;

      const { data, error } = await admin
        .from("profiles")
        .update(updates)
        .eq("id", profile.id)
        .select("id, display_name, email, avatar_url")
        .single();

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return data;
    }),

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const { profile } = ctx;
    const admin = createAdminClient();

    // Deleting the auth user cascades to the profile (FK on delete cascade),
    // and from there to memberships / reads / mutes. Messages keep their rows
    // with user_id set to null (on delete set null) so thread history stays.
    const { error } = await admin.auth.admin.deleteUser(profile.id);
    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }
    return { success: true };
  }),

  savePushToken: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();
      await admin.from("profiles").update({ push_token: input.token }).eq("id", profile.id);
      return { success: true };
    }),

  // Presence heartbeat — bumps last_seen_at so other users can see "last seen
  // X" once this user goes offline. Called periodically by PresenceProvider.
  heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
    const { profile } = ctx;
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", profile.id);
    return { success: true };
  }),

  lastSeen: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient();
      // Only expose last-seen for users who share a group with the caller.
      const [{ data: mine }, { data: theirs }] = await Promise.all([
        admin.from("group_memberships").select("group_id").eq("user_id", ctx.profile.id),
        admin.from("group_memberships").select("group_id").eq("user_id", input.userId),
      ]);
      const myGroups = new Set((mine ?? []).map((r) => r.group_id as string));
      const shares = (theirs ?? []).some((r) => myGroups.has(r.group_id as string));
      if (!shares) return { lastSeenAt: null };

      const { data } = await admin
        .from("profiles")
        .select("last_seen_at")
        .eq("id", input.userId)
        .maybeSingle();
      return { lastSeenAt: (data?.last_seen_at as string | null) ?? null };
    }),

  markIntroSeen: protectedProcedure.mutation(async ({ ctx }) => {
    const { profile } = ctx;
    const admin = createAdminClient();
    await admin.from("profiles").update({ intro_seen: true }).eq("id", profile.id);
    return { success: true };
  }),

  sendPasswordChangedEmail: protectedProcedure.mutation(async ({ ctx }) => {
    const { profile } = ctx;
    const resend = new Resend(process.env.RESEND_API_KEY);
    try {
      await resend.emails.send({
        from: "coldsoup <onboarding@resend.dev>",
        to: profile.email,
        subject: "Your coldsoup password has been changed",
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #1A1A18;">
            <h1 style="font-size: 20px; font-weight: 600; margin-bottom: 8px;">Password changed</h1>
            <p style="color: #6B6A65; margin-bottom: 24px;">
              Your coldsoup password was recently changed. If this wasn't you, contact your workspace admin immediately.
            </p>
          </div>
        `,
      });
    } catch {
      // Non-fatal
    }
    return { success: true };
  }),
});

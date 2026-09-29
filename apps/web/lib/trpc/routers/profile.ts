import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileUpdateInput } from "@/lib/profile-policy";
import {
  blobStateFromRow,
  chance,
  EVOLUTION,
  formShape,
  isShape,
  pickWeighted,
  rerollPool,
  rerollReady,
  SHINY3_ODDS,
  type BlobState,
} from "@/lib/blob-evolution";
import { baseShapeOf } from "@/lib/blob-base";
import { cryptoRand } from "@/lib/blob-server";

const BLOB_COLUMNS = "id, blob_level, blob_form, blob_shiny2, blob_shiny3, blob_lv3_shape";

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
    .input(profileUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      const updates: Record<string, unknown> = {};
      if (input.displayName !== undefined) updates.display_name = input.displayName;

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

  // Blob state for everyone who shares a group with the caller (and the caller).
  blobs: protectedProcedure.query(async ({ ctx }) => {
    const admin = createAdminClient();
    // Peers via one nested query; my own row in parallel (I may be in no group).
    const [{ data: nested, error }, { data: me }] = await Promise.all([
      admin
        .from("group_memberships")
        .select(`groups(group_memberships(profiles(${BLOB_COLUMNS})))`)
        .eq("user_id", ctx.profile.id),
      admin.from("profiles").select(BLOB_COLUMNS).eq("id", ctx.profile.id),
    ]);
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

    const rows = new Map<string, Record<string, unknown>>();
    for (const r of (me ?? []) as unknown as Record<string, unknown>[]) rows.set(r.id as string, r);
    for (const m of (nested ?? []) as unknown as {
      groups: { group_memberships: { profiles: Record<string, unknown> | null }[] } | null;
    }[]) {
      for (const gm of m.groups?.group_memberships ?? []) {
        if (gm.profiles) rows.set(gm.profiles.id as string, gm.profiles);
      }
    }
    const data = Array.from(rows.values());

    const out: Record<string, BlobState> = {};
    for (const row of data ?? []) out[row.id as string] = blobStateFromRow(row);
    return out;
  }),

  // The caller's own blob, plus the counters only Settings needs.
  myBlob: protectedProcedure.query(async ({ ctx }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select(`${BLOB_COLUMNS}, blob_xp, blob_reroll_xp`)
      .eq("id", ctx.profile.id)
      .single();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return {
      ...blobStateFromRow(data),
      xp: (data.blob_xp as number) ?? 0,
      rerollXp: (data.blob_reroll_xp as number) ?? 0,
    };
  }),

  setBlobForm: protectedProcedure
    .input(z.object({ form: z.union([z.literal(1), z.literal(2), z.literal(3)]) }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("profiles")
        .update({ blob_form: input.form })
        .eq("id", ctx.profile.id)
        .gte("blob_level", input.form)
        .select("id");
      if (!data?.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Form not unlocked yet" });
      return { form: input.form };
    }),

  // New Lv3 shape + a 1-in-4 shiny roll. Guarded by an optimistic check on
  // blob_reroll_xp so a double-click or race spends at most one charge.
  rerollLv3: protectedProcedure.mutation(async ({ ctx }) => {
    const admin = createAdminClient();
    const { data: row } = await admin
      .from("profiles")
      .select("blob_level, blob_shiny3, blob_xp, blob_reroll_xp, blob_lv3_shape")
      .eq("id", ctx.profile.id)
      .single();
    if (
      !row ||
      !rerollReady({
        level: row.blob_level as number,
        shiny3: row.blob_shiny3 as boolean,
        xp: row.blob_xp as number,
        rerollXp: row.blob_reroll_xp as number,
      })
    ) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No reroll charge yet" });
    }

    const base = baseShapeOf(ctx.profile.id);
    const previous = formShape(base, 3, isShape(row.blob_lv3_shape) ? row.blob_lv3_shape : null);
    const shape = pickWeighted(rerollPool(base, EVOLUTION[base][0], previous), cryptoRand);
    const shiny = chance(SHINY3_ODDS, cryptoRand);

    const updates = shiny
      ? { blob_reroll_xp: row.blob_xp, blob_lv3_shape: shape, blob_shiny3: true, blob_pending_shape: null }
      : { blob_reroll_xp: row.blob_xp, blob_pending_shape: shape };
    const { data: done } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", ctx.profile.id)
      .eq("blob_reroll_xp", row.blob_reroll_xp as number)
      .eq("blob_shiny3", false)
      .select("id");
    if (!done?.length) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No reroll charge yet" });
    }
    return { previous, shape, shiny };
  }),

  // After a missed reroll: adopt the rolled shape. Only the server-rolled
  // pending shape can be kept; users never write a shape directly.
  keepLv3Shape: protectedProcedure.mutation(async ({ ctx }) => {
    const admin = createAdminClient();
    const { data: row } = await admin
      .from("profiles")
      .select("blob_pending_shape")
      .eq("id", ctx.profile.id)
      .single();
    const pending = row?.blob_pending_shape;
    if (!isShape(pending)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nothing to keep" });
    }
    await admin
      .from("profiles")
      .update({ blob_lv3_shape: pending, blob_pending_shape: null })
      .eq("id", ctx.profile.id)
      .eq("blob_pending_shape", pending);
    return { shape: pending };
  }),

  sendPasswordChangedEmail: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await ctx.getProfile();
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

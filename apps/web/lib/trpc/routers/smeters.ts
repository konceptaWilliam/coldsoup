import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStats } from "@/lib/smeter-insights";

// ISO date (YYYY-MM-DD), as the standalone planner stores custom dates.
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

function expectedDays(mode: string, customDates: string[] | null): number {
  return mode === "dates" && customDates ? customDates.length : 7;
}

type SMeterSummary = {
  id: string;
  mode: "weekly" | "dates";
  title: string | null;
  customDates: string[] | null;
  votedCount: number;
  memberCount: number;
  allVoted: boolean;
};

export const smetersRouter = router({
  // Light summaries (counts only — no scores) for a set of S-meters. Mirrors
  // polls.getMany; used on web to refresh inline cards live as votes land and
  // to fill a newly-arrived S-meter card without a full message refetch.
  getMany: protectedProcedure
    .input(z.object({ smeterIds: z.array(z.string().uuid()).max(50) }))
    .query(async ({ ctx, input }): Promise<Record<string, SMeterSummary>> => {
      const { profile } = ctx;
      const admin = createAdminClient();
      if (input.smeterIds.length === 0) return {};

      const { data: smeterRows } = await admin
        .from("smeters")
        .select("id, thread_id, mode, custom_dates, title")
        .in("id", input.smeterIds);
      if (!smeterRows || smeterRows.length === 0) return {};

      // Membership check — only summarise S-meters in the caller's groups.
      const threadIds = Array.from(new Set(smeterRows.map((s) => s.thread_id as string)));
      const { data: threads } = await admin.from("threads").select("id, group_id").in("id", threadIds);
      const threadGroup = new Map((threads ?? []).map((t) => [t.id as string, t.group_id as string]));
      const groupIds = Array.from(new Set((threads ?? []).map((t) => t.group_id as string)));
      const { data: memberships } = await admin
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", profile.id)
        .in("group_id", groupIds);
      const memberGroupIds = new Set((memberships ?? []).map((m) => m.group_id as string));

      const allowed = smeterRows.filter((s) => memberGroupIds.has(threadGroup.get(s.thread_id as string) ?? ""));
      if (allowed.length === 0) return {};
      const allowedIds = allowed.map((s) => s.id as string);

      // Member count per group + responses for all allowed smeters.
      const [{ data: memberRows }, { data: responseRows }] = await Promise.all([
        admin.from("group_memberships").select("group_id").in("group_id", groupIds),
        admin.from("smeter_responses").select("smeter_id, user_id").in("smeter_id", allowedIds),
      ]);
      const memberCountByGroup = new Map<string, number>();
      for (const m of memberRows ?? []) {
        const g = m.group_id as string;
        memberCountByGroup.set(g, (memberCountByGroup.get(g) ?? 0) + 1);
      }

      const result: Record<string, SMeterSummary> = {};
      for (const s of allowed) {
        const group = threadGroup.get(s.thread_id as string) ?? "";
        const memberCount = memberCountByGroup.get(group) ?? 0;
        const voters = new Set((responseRows ?? []).filter((r) => r.smeter_id === s.id).map((r) => r.user_id as string));
        result[s.id as string] = {
          id: s.id as string,
          mode: (s.mode as "weekly" | "dates") ?? "weekly",
          title: (s.title as string | null) ?? null,
          customDates: (s.custom_dates as string[] | null) ?? null,
          votedCount: voters.size,
          memberCount,
          allVoted: memberCount > 0 && voters.size === memberCount,
        };
      }
      return result;
    }),

  // Create an S-meter and drop it into the thread as a message (carried on
  // messages.smeter_id, exactly like polls). Any group member may create one.
  create: protectedProcedure
    .input(
      z
        .object({
          threadId: z.string().uuid(),
          mode: z.enum(["weekly", "dates"]).default("weekly"),
          customDates: z.array(ISO_DATE).min(1).max(60).optional(),
          title: z.string().min(1).max(200).optional(),
        })
        .refine((d) => d.mode !== "dates" || (d.customDates && d.customDates.length >= 1), {
          message: "customDates required for dates mode",
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

      const customDates = input.mode === "dates" ? input.customDates ?? null : null;

      const { data: smeter, error: smErr } = await admin
        .from("smeters")
        .insert({
          thread_id: input.threadId,
          mode: input.mode,
          custom_dates: customDates,
          title: input.title ?? null,
          created_by: profile.id,
        })
        .select("id")
        .single();
      if (smErr || !smeter) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [{ data: message, error: msgErr }] = await Promise.all([
        admin
          .from("messages")
          .insert({ thread_id: input.threadId, user_id: profile.id, body: "", smeter_id: smeter.id })
          .select("id, body, created_at, edited_at, is_deleted, thread_id, user_id, attachments, reply_to_id, poll_id, smeter_id, profiles(id, display_name, avatar_url)")
          .single(),
        admin.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", input.threadId),
      ]);
      if (msgErr || !message) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return message;
    }),

  // Submit one member's full set of per-day scores. Locked after submit:
  // rejected if this member already has any response for this S-meter.
  submit: protectedProcedure
    .input(
      z.object({
        smeterId: z.string().uuid(),
        responses: z
          .array(z.object({ dayIndex: z.number().int().min(0), painScore: z.number().int().min(1).max(6) }))
          .min(1)
          .max(60),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: smeter } = await admin
        .from("smeters")
        .select("id, thread_id, mode, custom_dates")
        .eq("id", input.smeterId)
        .single();
      if (!smeter) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: thread } = await admin.from("threads").select("group_id").eq("id", smeter.thread_id).single();
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const expected = expectedDays(smeter.mode as string, smeter.custom_dates as string[] | null);

      // Exactly one score per day, every day, indices in range — no partial submits.
      const indices = input.responses.map((r) => r.dayIndex);
      const uniqueIndices = new Set(indices);
      if (
        input.responses.length !== expected ||
        uniqueIndices.size !== expected ||
        indices.some((i) => i >= expected)
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Must score every day exactly once" });
      }

      // Lock: bail if this member already submitted.
      const { data: existing } = await admin
        .from("smeter_responses")
        .select("id")
        .eq("smeter_id", input.smeterId)
        .eq("user_id", profile.id)
        .limit(1);
      if (existing && existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Already submitted" });
      }

      const { error } = await admin.from("smeter_responses").insert(
        input.responses.map((r) => ({
          smeter_id: input.smeterId,
          user_id: profile.id,
          day_index: r.dayIndex,
          pain_score: r.painScore,
        }))
      );
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return { success: true };
    }),

  // Full S-meter state for the dedicated route: meta, member vote status, my own
  // scores (drives the lock), and the aggregate stats — which are null until
  // every group member has voted (the gated reveal).
  get: protectedProcedure
    .input(z.object({ smeterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: smeter } = await admin
        .from("smeters")
        .select("id, thread_id, mode, custom_dates, title, created_by, created_at")
        .eq("id", input.smeterId)
        .single();
      if (!smeter) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: thread } = await admin.from("threads").select("group_id").eq("id", smeter.thread_id).single();
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const mode = smeter.mode as string;
      const customDates = (smeter.custom_dates as string[] | null) ?? null;
      const expected = expectedDays(mode, customDates);

      const [{ data: memberRows }, { data: responseRows }] = await Promise.all([
        admin.from("group_memberships").select("profiles(id, display_name, avatar_url)").eq("group_id", thread.group_id),
        admin
          .from("smeter_responses")
          .select("user_id, day_index, pain_score, profiles(display_name)")
          .eq("smeter_id", input.smeterId),
      ]);

      const responses = responseRows ?? [];
      const votedUserIds = new Set(responses.map((r) => r.user_id as string));

      const members = ((memberRows ?? [])
        .map((row) => {
          const p = row.profiles as unknown as { id: string; display_name: string; avatar_url: string | null } | null;
          if (!p) return null;
          return { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, hasVoted: votedUserIds.has(p.id) };
        })
        .filter(Boolean) as { id: string; display_name: string; avatar_url: string | null; hasVoted: boolean }[])
        .sort((a, b) => a.display_name.localeCompare(b.display_name));

      const memberCount = members.length;
      const votedCount = members.filter((m) => m.hasVoted).length;
      const allVoted = memberCount > 0 && votedCount === memberCount;

      const myResponses = responses
        .filter((r) => r.user_id === profile.id)
        .map((r) => ({ dayIndex: r.day_index as number, painScore: r.pain_score as number }))
        .sort((a, b) => a.dayIndex - b.dayIndex);

      const stats = allVoted
        ? buildStats(
            responses.map((r) => ({
              dayIndex: r.day_index as number,
              painScore: r.pain_score as number,
              userId: r.user_id as string,
              displayName: (r.profiles as unknown as { display_name: string } | null)?.display_name ?? "Unknown",
            })),
            expected
          )
        : null;

      return {
        id: smeter.id as string,
        mode: mode as "weekly" | "dates",
        customDates,
        title: (smeter.title as string | null) ?? null,
        members,
        memberCount,
        votedCount,
        allVoted,
        myResponses: myResponses.length > 0 ? myResponses : null,
        stats,
      };
    }),
});

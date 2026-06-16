import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStats } from "@/lib/smeter-insights";
import { postSystemMessage } from "@/lib/system-messages";

// ISO date (YYYY-MM-DD), as the standalone planner stores custom dates.
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

type SMeterMode = "weekly" | "dates" | "statements";

// Number of votable cards: custom dates / statements carry their own count,
// weekly is always the 7-day grid.
function expectedDays(
  mode: string,
  customDates: string[] | null,
  customLabels: string[] | null,
): number {
  if (mode === "dates" && customDates) return customDates.length;
  if (mode === "statements" && customLabels) return customLabels.length;
  return 7;
}

type SMeterSummary = {
  id: string;
  mode: SMeterMode;
  title: string | null;
  customDates: string[] | null;
  customLabels: string[] | null;
  votedCount: number;
  memberCount: number;
  allVoted: boolean;
  isParticipant: boolean;
};

type AdminClient = ReturnType<typeof createAdminClient>;

// Push to a set of users (Expo + Web Push), skipping muted/paused recipients.
// Shared by S-meter create and completion. Best-effort — callers wrap in try.
async function notifyParticipants(
  admin: AdminClient,
  recipients: string[],
  opts: {
    threadId: string;
    groupId: string;
    expoTitle: string;
    subtitle: string;
    expoBody: string;
    webTitle: string;
    webBody: string;
    tag: string;
  }
) {
  if (recipients.length === 0) return;

  const [{ data: profiles }, { data: muteRows }] = await Promise.all([
    admin.from("profiles").select("id, push_token, notifications_paused").in("id", recipients),
    admin.from("mutes").select("user_id").in("user_id", recipients).in("target_id", [opts.threadId, opts.groupId]),
  ]);
  const muted = new Set((muteRows ?? []).map((m) => m.user_id as string));
  const eligible = (profiles ?? []).filter(
    (p) => !muted.has(p.id as string) && !(p as { notifications_paused: boolean }).notifications_paused
  );
  const eligibleIds = eligible.map((p) => p.id as string);
  const data = { threadId: opts.threadId, groupId: opts.groupId };

  // Expo push (mobile)
  const tokens = eligible
    .map((p) => (p as { push_token: string | null }).push_token)
    .filter((tk): tk is string => Boolean(tk));
  if (tokens.length > 0) {
    fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        tokens.map((token) => ({ to: token, title: opts.expoTitle, subtitle: opts.subtitle, body: opts.expoBody, data }))
      ),
    }).catch(() => null);
  }

  // Web Push (PWA)
  if (eligibleIds.length > 0) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", eligibleIds);
    if (subs && subs.length > 0) {
      const { sendWebPush } = await import("@/lib/web-push");
      const payload = { title: opts.webTitle, body: opts.webBody, tag: opts.tag, data };
      const results = await Promise.all(
        subs.map((s) =>
          sendWebPush(
            { endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string },
            payload
          ).then((r) => ({ endpoint: s.endpoint as string, r }))
        )
      );
      const dead = results.filter((x) => x.r === "gone").map((x) => x.endpoint);
      if (dead.length > 0) await admin.from("push_subscriptions").delete().in("endpoint", dead);
    }
  }
}

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
        .select("id, thread_id, mode, custom_dates, custom_labels, title, participant_ids")
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

      // Group members (to expand null participant_ids = "all members") + responses.
      const [{ data: memberRows }, { data: responseRows }] = await Promise.all([
        admin.from("group_memberships").select("group_id, user_id").in("group_id", groupIds),
        admin.from("smeter_responses").select("smeter_id, user_id").in("smeter_id", allowedIds),
      ]);
      const memberIdsByGroup = new Map<string, string[]>();
      for (const m of memberRows ?? []) {
        const g = m.group_id as string;
        const arr = memberIdsByGroup.get(g) ?? [];
        arr.push(m.user_id as string);
        memberIdsByGroup.set(g, arr);
      }

      const result: Record<string, SMeterSummary> = {};
      for (const s of allowed) {
        const group = threadGroup.get(s.thread_id as string) ?? "";
        const participants = (s.participant_ids as string[] | null) ?? memberIdsByGroup.get(group) ?? [];
        const participantSet = new Set(participants);
        const voters = new Set(
          (responseRows ?? [])
            .filter((r) => r.smeter_id === s.id && participantSet.has(r.user_id as string))
            .map((r) => r.user_id as string)
        );
        const memberCount = participants.length;
        result[s.id as string] = {
          id: s.id as string,
          mode: (s.mode as SMeterMode) ?? "weekly",
          title: (s.title as string | null) ?? null,
          customDates: (s.custom_dates as string[] | null) ?? null,
          customLabels: (s.custom_labels as string[] | null) ?? null,
          votedCount: voters.size,
          memberCount,
          allVoted: memberCount > 0 && voters.size === memberCount,
          isParticipant: participantSet.has(profile.id),
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
          mode: z.enum(["weekly", "dates", "statements"]).default("weekly"),
          customDates: z.array(ISO_DATE).min(1).max(60).optional(),
          customLabels: z.array(z.string().min(1).max(200)).min(1).max(60).optional(),
          title: z.string().min(1).max(200).optional(),
          // Subset of group members to include. Omitted = everyone.
          participantIds: z.array(z.string().uuid()).min(1).max(200).optional(),
        })
        .refine((d) => d.mode !== "dates" || (d.customDates && d.customDates.length >= 1), {
          message: "customDates required for dates mode",
        })
        .refine((d) => d.mode !== "statements" || (d.customLabels && d.customLabels.length >= 1), {
          message: "customLabels required for statements mode",
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
      const customLabels = input.mode === "statements" ? input.customLabels ?? null : null;

      // Resolve participants to an explicit list: all current group members,
      // optionally narrowed to the requested subset. Always store the set so a
      // member who joins later doesn't silently change the gate.
      const { data: groupMembers } = await admin
        .from("group_memberships")
        .select("user_id")
        .eq("group_id", thread.group_id);
      const memberIds = new Set((groupMembers ?? []).map((m) => m.user_id as string));
      const requested = input.participantIds?.filter((id) => memberIds.has(id));
      const participantIds = requested && requested.length > 0 ? requested : Array.from(memberIds);
      if (participantIds.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No participants" });

      const { data: smeter, error: smErr } = await admin
        .from("smeters")
        .insert({
          thread_id: input.threadId,
          mode: input.mode,
          custom_dates: customDates,
          custom_labels: customLabels,
          title: input.title ?? null,
          participant_ids: participantIds,
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

      // Notify the other participants (best-effort), scoped to the chosen set.
      try {
        const recipients = participantIds.filter((id) => id !== profile.id);
        if (recipients.length > 0) {
          const senderName =
            (message.profiles as unknown as { display_name: string } | null)?.display_name ?? "Someone";

          const { data: meta } = await admin
            .from("threads")
            .select("title, groups(name)")
            .eq("id", input.threadId)
            .single();
          const groupName = (meta?.groups as unknown as { name: string } | null)?.name ?? "";
          const threadTitle = (meta?.title as string | null) ?? "";
          const location = `.${groupName}#${threadTitle}`;
          const previewBody = `Started an S-meter${input.title ? `: ${input.title}` : ""}`;

          await notifyParticipants(admin, recipients, {
            threadId: input.threadId,
            groupId: thread.group_id,
            expoTitle: senderName,
            subtitle: location,
            expoBody: previewBody,
            webTitle: senderName,
            webBody: `${location}\n${previewBody}`,
            tag: message.id as string,
          });
        }
      } catch {
        // best-effort; never block S-meter creation
      }

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
        .select("id, thread_id, mode, custom_dates, custom_labels, participant_ids, title, created_by")
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

      // Only participants may vote (null = everyone).
      const participantIds = smeter.participant_ids as string[] | null;
      if (participantIds && !participantIds.includes(profile.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant" });
      }

      const expected = expectedDays(
        smeter.mode as string,
        smeter.custom_dates as string[] | null,
        smeter.custom_labels as string[] | null,
      );

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

      // Completion: if this was the final participant to vote, post a system
      // message ("… s-meter is done") and notify everyone. Best-effort.
      try {
        const participants =
          participantIds ??
          ((await admin.from("group_memberships").select("user_id").eq("group_id", thread.group_id)).data ?? []).map(
            (m) => m.user_id as string
          );
        const participantSet = new Set(participants);

        const { data: allResp } = await admin
          .from("smeter_responses")
          .select("user_id")
          .eq("smeter_id", input.smeterId);
        const voters = new Set(
          (allResp ?? []).filter((r) => participantSet.has(r.user_id as string)).map((r) => r.user_id as string)
        );

        // Already-posted guard: a smeter_done system message for this S-meter.
        const { count: existingDone } = await admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("thread_id", smeter.thread_id)
          .eq("system_event->>kind", "smeter_done")
          .eq("system_event->>smeterId", input.smeterId);

        const justCompleted =
          participants.length > 0 && voters.size === participants.length && (existingDone ?? 0) === 0;

        if (justCompleted) {
          const smeterTitle = smeter.title as string | null;
          const doneMsg = await postSystemMessage(admin, smeter.thread_id, {
            kind: "smeter_done",
            smeterId: input.smeterId,
            smeterTitle,
          });

          const { data: meta } = await admin
            .from("threads")
            .select("title, groups(name)")
            .eq("id", smeter.thread_id)
            .single();
          const groupName = (meta?.groups as unknown as { name: string } | null)?.name ?? "";
          const threadTitle = (meta?.title as string | null) ?? "";
          const location = `.${groupName}#${threadTitle}`;
          const doneText = smeterTitle ? `S-meter ${smeterTitle} done!` : "S-meter done!";

          await notifyParticipants(admin, participants.filter((id) => id !== profile.id), {
            threadId: smeter.thread_id,
            groupId: thread.group_id,
            expoTitle: doneText,
            subtitle: location,
            expoBody: "Everyone answered — tap to see the results",
            webTitle: doneText,
            webBody: `${location}\nEveryone answered`,
            tag: (doneMsg?.id as string) ?? input.smeterId,
          });
        }
      } catch {
        // best-effort; completion notice/publish must never fail the vote
      }

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
        .select("id, thread_id, mode, custom_dates, custom_labels, title, participant_ids, created_by, created_at")
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
      const customLabels = (smeter.custom_labels as string[] | null) ?? null;
      const expected = expectedDays(mode, customDates, customLabels);

      const [{ data: memberRows }, { data: responseRows }] = await Promise.all([
        admin.from("group_memberships").select("profiles(id, display_name, avatar_url)").eq("group_id", thread.group_id),
        admin
          .from("smeter_responses")
          .select("user_id, day_index, pain_score, profiles(display_name)")
          .eq("smeter_id", input.smeterId),
      ]);

      const responses = responseRows ?? [];
      const votedUserIds = new Set(responses.map((r) => r.user_id as string));

      // Restrict to participants (null = all group members).
      const participantIds = smeter.participant_ids as string[] | null;
      const participantSet = participantIds ? new Set(participantIds) : null;

      const members = ((memberRows ?? [])
        .map((row) => {
          const p = row.profiles as unknown as { id: string; display_name: string; avatar_url: string | null } | null;
          if (!p) return null;
          return { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, hasVoted: votedUserIds.has(p.id) };
        })
        .filter(Boolean) as { id: string; display_name: string; avatar_url: string | null; hasVoted: boolean }[])
        .filter((m) => !participantSet || participantSet.has(m.id))
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
        mode: mode as SMeterMode,
        customDates,
        customLabels,
        title: (smeter.title as string | null) ?? null,
        members,
        memberCount,
        votedCount,
        allVoted,
        isParticipant: !participantSet || participantSet.has(profile.id),
        myResponses: myResponses.length > 0 ? myResponses : null,
        stats,
      };
    }),
});

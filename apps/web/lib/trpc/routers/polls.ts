import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";

type VoterInfo = { id: string; display_name: string; avatar_url: string | null };
type PollData = {
  id: string;
  question: string;
  options: { id: string; text: string; vote_count: number; user_voted: boolean; voters: VoterInfo[] }[];
};

export const pollsRouter = router({
  // Fetch full poll data (options, vote counts, voters) for a set of polls.
  // Used to refresh polls live when votes/options change.
  getMany: protectedProcedure
    .input(z.object({ pollIds: z.array(z.string().uuid()).max(50) }))
    .query(async ({ ctx, input }): Promise<Record<string, PollData>> => {
      const { profile } = ctx;
      const admin = createAdminClient();
      if (input.pollIds.length === 0) return {};

      const { data: pollRows } = await admin
        .from("polls")
        .select("id, question, thread_id")
        .in("id", input.pollIds);
      if (!pollRows || pollRows.length === 0) return {};

      // Membership check — only return polls in groups the caller belongs to.
      const threadIds = Array.from(new Set(pollRows.map((p) => p.thread_id as string)));
      const { data: threads } = await admin.from("threads").select("id, group_id").in("id", threadIds);
      const threadGroup = new Map((threads ?? []).map((t) => [t.id as string, t.group_id as string]));
      const groupIds = Array.from(new Set((threads ?? []).map((t) => t.group_id as string)));
      const { data: memberships } = await admin
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", profile.id)
        .in("group_id", groupIds);
      const memberGroupIds = new Set((memberships ?? []).map((m) => m.group_id as string));

      const allowed = pollRows.filter((p) =>
        memberGroupIds.has(threadGroup.get(p.thread_id as string) ?? "")
      );
      if (allowed.length === 0) return {};
      const allowedIds = allowed.map((p) => p.id as string);

      const { data: optionRows } = await admin
        .from("poll_options")
        .select("id, poll_id, text")
        .in("poll_id", allowedIds)
        .order("created_at");
      const optionIds = (optionRows ?? []).map((o) => o.id as string);
      const { data: voteRows } = optionIds.length > 0
        ? await admin
            .from("poll_votes")
            .select("poll_option_id, user_id, profiles(id, display_name, avatar_url)")
            .in("poll_option_id", optionIds)
        : { data: [] as { poll_option_id: string; user_id: string; profiles: unknown }[] };

      const result: Record<string, PollData> = {};
      for (const poll of allowed) {
        const options = (optionRows ?? [])
          .filter((o) => o.poll_id === poll.id)
          .map((o) => {
            const votes = (voteRows ?? []).filter((v) => v.poll_option_id === o.id);
            return {
              id: o.id as string,
              text: o.text as string,
              vote_count: votes.length,
              user_voted: votes.some((v) => v.user_id === profile.id),
              voters: votes.map((v) => {
                const p = v.profiles as { id: string; display_name: string; avatar_url: string | null } | null;
                return { id: v.user_id as string, display_name: p?.display_name ?? "Unknown", avatar_url: p?.avatar_url ?? null };
              }),
            };
          });
        result[poll.id as string] = { id: poll.id as string, question: poll.question as string, options };
      }
      return result;
    }),

  create: protectedProcedure
    .input(
      z.object({
        threadId: z.string().uuid(),
        question: z.string().min(1).max(500),
        options: z.array(z.string().min(1).max(200)).max(20).default([]),
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

      const { data: poll, error: pollErr } = await admin
        .from("polls")
        .insert({ thread_id: input.threadId, question: input.question, created_by: profile.id })
        .select("id")
        .single();
      if (pollErr || !poll) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.options.length > 0) {
        await admin.from("poll_options").insert(
          input.options.filter(Boolean).map((text) => ({ poll_id: poll.id, text, created_by: profile.id }))
        );
      }

      const [{ data: message, error: msgErr }] = await Promise.all([
        admin
          .from("messages")
          .insert({ thread_id: input.threadId, user_id: profile.id, body: "", poll_id: poll.id })
          .select("id, body, created_at, edited_at, is_deleted, thread_id, user_id, attachments, reply_to_id, poll_id, profiles(id, display_name, avatar_url)")
          .single(),
        admin.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", input.threadId),
      ]);
      if (msgErr || !message) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return message;
    }),

  addOption: protectedProcedure
    .input(z.object({ pollId: z.string().uuid(), text: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: poll } = await admin.from("polls").select("thread_id").eq("id", input.pollId).single();
      if (!poll) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: thread } = await admin.from("threads").select("group_id").eq("id", poll.thread_id).single();
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const { data, error } = await admin
        .from("poll_options")
        .insert({ poll_id: input.pollId, text: input.text, created_by: profile.id })
        .select("id, text")
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return data;
    }),

  vote: protectedProcedure
    .input(z.object({ pollOptionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { supabase, profile } = ctx;
      const admin = createAdminClient();

      const { data: option } = await admin
        .from("poll_options")
        .select("poll_id")
        .eq("id", input.pollOptionId)
        .single();
      if (!option) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: poll } = await admin.from("polls").select("thread_id").eq("id", option.poll_id).single();
      if (!poll) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: thread } = await admin.from("threads").select("group_id").eq("id", poll.thread_id).single();
      if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

      const { data: membership } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", thread.group_id)
        .eq("user_id", profile.id)
        .single();
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      const { data: existing } = await admin
        .from("poll_votes")
        .select("id")
        .eq("poll_option_id", input.pollOptionId)
        .eq("user_id", profile.id)
        .maybeSingle();

      if (existing) {
        await admin.from("poll_votes").delete().eq("id", existing.id);
      } else {
        await admin.from("poll_votes").insert({ poll_option_id: input.pollOptionId, user_id: profile.id });
      }

      return { success: true };
    }),
});

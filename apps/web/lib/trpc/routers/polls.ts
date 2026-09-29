import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertThreadAccess } from "../thread-access";
import { accessibleByGroup } from "@/lib/server-shapes";

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

      // One wave: polls (+ their group), options with embedded votes, and the
      // caller's groups for the access filter.
      const [{ data: pollRows }, { data: optionRows }, { data: memberships }] = await Promise.all([
        admin.from("polls").select("id, question, threads!inner(group_id)").in("id", input.pollIds),
        admin
          .from("poll_options")
          .select("id, poll_id, text, created_at, poll_votes(user_id, profiles(id, display_name, avatar_url))")
          .in("poll_id", input.pollIds)
          .order("created_at"),
        admin.from("group_memberships").select("group_id").eq("user_id", profile.id),
      ]);

      const myGroups = new Set((memberships ?? []).map((m) => m.group_id as string));
      const allowed = accessibleByGroup(
        pollRows ?? [],
        (p) => (p.threads as unknown as { group_id: string } | null)?.group_id,
        myGroups,
      );

      const result: Record<string, PollData> = {};
      for (const poll of allowed) {
        const options = (optionRows ?? [])
          .filter((o) => o.poll_id === poll.id)
          .map((o) => {
            const votes = (o.poll_votes ?? []) as unknown as {
              user_id: string;
              profiles: { id: string; display_name: string; avatar_url: string | null } | null;
            }[];
            return {
              id: o.id as string,
              text: o.text as string,
              vote_count: votes.length,
              user_voted: votes.some((v) => v.user_id === profile.id),
              voters: votes.map((v) => ({
                id: v.user_id,
                display_name: v.profiles?.display_name ?? "Unknown",
                avatar_url: v.profiles?.avatar_url ?? null,
              })),
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
      const { profile } = ctx;
      const admin = createAdminClient();

      await assertThreadAccess(admin, input.threadId, profile.id);

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
      const { profile } = ctx;
      const admin = createAdminClient();

      const { data: access, error: accessErr } = await admin.rpc("poll_access", {
        p_poll: input.pollId,
        p_user: profile.id,
      });
      if (accessErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: accessErr.message });
      if (!(access as unknown[] | null)?.length) throw new TRPCError({ code: "NOT_FOUND" });

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
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("vote_toggle", {
        p_option: input.pollOptionId,
        p_user: ctx.profile.id,
      });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      const row = (data as { poll_id: string; voted: boolean }[] | null)?.[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { success: true, voted: row.voted };
    }),
});

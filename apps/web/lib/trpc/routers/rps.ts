import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertThreadAccess } from "../thread-access";
import { waitUntil } from "@/lib/wait-until";
import { notifyParticipants } from "@/lib/smeter-push";
import { RPS_GAME_COLUMNS, loadRpsSummaries, type RpsGameRecord } from "@/lib/rps-server";
import {
  moveOf,
  resultOf,
  summarize,
  type RpsDetail,
  type RpsMoveRow,
  type RpsSummary,
} from "@/lib/rps";

type Admin = ReturnType<typeof createAdminClient>;

const MOVE = z.enum(["rock", "paper", "scissors"]);

const MESSAGE_COLUMNS =
  "id, body, created_at, edited_at, is_deleted, thread_id, user_id, attachments, reply_to_id, poll_id, smeter_id, rps_id, profiles(id, display_name, avatar_url)";

async function isGroupMember(admin: Admin, groupId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("group_memberships")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

// One game + its moves, after checking the caller belongs to the game's group.
// Not found and not a member both surface as NOT_FOUND (no existence leak).
async function loadGame(admin: Admin, gameId: string, viewerId: string) {
  const [{ data: raw }, { data: moves }, { data: view }] = await Promise.all([
    admin.from("rps_games").select(RPS_GAME_COLUMNS).eq("id", gameId).maybeSingle(),
    admin.from("rps_moves").select("game_id, user_id, move").eq("game_id", gameId),
    admin.from("rps_views").select("game_id").eq("game_id", gameId).eq("user_id", viewerId).maybeSingle(),
  ]);
  const game = raw as unknown as RpsGameRecord | null;
  const groupId = game?.threads?.group_id;
  if (!game || !groupId || !(await isGroupMember(admin, groupId, viewerId))) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return { game, moves: (moves ?? []) as RpsMoveRow[], groupId, seen: !!view };
}

// Summary + moves. While pending, only the viewer's own move is revealed.
function detail(game: RpsGameRecord, moves: RpsMoveRow[], viewerId: string, seen: boolean): RpsDetail {
  const s = summarize(game, moves, viewerId, seen);
  const done = s.status === "done";
  return {
    ...s,
    moves: {
      challenger: done || s.role === "challenger" ? moveOf(moves, game.id, game.challenger_id) : null,
      opponent: done || s.role === "opponent" ? moveOf(moves, game.id, game.opponent_id) : null,
    },
  };
}

// Push to one player, formatted like the S-meter push (sender as title,
// ".group#thread" as subtitle). Best-effort — callers wrap in waitUntil + catch.
async function pushTo(
  admin: Admin,
  recipient: string,
  opts: { threadId: string; groupId: string; senderName: string; body: string; tag: string; messageId?: string },
) {
  const { data: meta } = await admin.from("threads").select("title, groups(name)").eq("id", opts.threadId).single();
  const groupName = (meta?.groups as unknown as { name: string } | null)?.name ?? "";
  const threadTitle = (meta?.title as string | null) ?? "";
  const location = `.${groupName}#${threadTitle}`;
  await notifyParticipants(admin, [recipient], {
    threadId: opts.threadId,
    groupId: opts.groupId,
    expoTitle: opts.senderName,
    subtitle: location,
    expoBody: opts.body,
    webTitle: opts.senderName,
    webBody: `${location}\n${opts.body}`,
    tag: opts.tag,
    messageId: opts.messageId,
  });
}

export const rpsRouter = router({
  // Challenge a group member: stores the game, the challenger's move and the
  // card message, then pushes the opponent.
  create: protectedProcedure
    .input(
      z.object({
        threadId: z.string().uuid(),
        opponentId: z.string().uuid(),
        move: MOVE,
        rematchOf: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { profile } = ctx;
      const admin = createAdminClient();

      if (input.opponentId === profile.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't challenge yourself" });
      }
      const thread = await assertThreadAccess(admin, input.threadId, profile.id);
      if (!(await isGroupMember(admin, thread.group_id, input.opponentId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Opponent is not in this group" });
      }

      if (input.rematchOf) {
        const [{ data: prev }, { data: prevMoves }, { data: existing }] = await Promise.all([
          admin
            .from("rps_games")
            .select("id, thread_id, status, challenger_id, opponent_id")
            .eq("id", input.rematchOf)
            .maybeSingle(),
          admin.from("rps_moves").select("game_id, user_id, move").eq("game_id", input.rematchOf),
          admin.from("rps_games").select("id").eq("rematch_of", input.rematchOf).limit(1),
        ]);
        // One rematch per tie: if the other player already started it, don't
        // spawn a second game.
        if (existing && existing.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Rematch already started" });
        }
        const players = prev ? [prev.challenger_id as string | null, prev.opponent_id as string | null] : [];
        const tie =
          !!prev &&
          prev.status === "done" &&
          resultOf(
            moveOf((prevMoves ?? []) as RpsMoveRow[], prev.id as string, prev.challenger_id as string | null),
            moveOf((prevMoves ?? []) as RpsMoveRow[], prev.id as string, prev.opponent_id as string | null),
          ) === "tie";
        if (
          !prev ||
          prev.thread_id !== input.threadId ||
          !tie ||
          !players.includes(profile.id) ||
          !players.includes(input.opponentId)
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid rematch" });
        }
      }

      const { data: game, error: gameErr } = await admin
        .from("rps_games")
        .insert({
          thread_id: input.threadId,
          challenger_id: profile.id,
          opponent_id: input.opponentId,
          rematch_of: input.rematchOf ?? null,
        })
        .select("id")
        .single();
      if (gameErr || !game) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { error: moveErr } = await admin
        .from("rps_moves")
        .insert({ game_id: game.id, user_id: profile.id, move: input.move });
      if (moveErr) {
        await admin.from("rps_games").delete().eq("id", game.id);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      const [{ data: message, error: msgErr }] = await Promise.all([
        admin
          .from("messages")
          .insert({ thread_id: input.threadId, user_id: profile.id, body: "", rps_id: game.id })
          .select(MESSAGE_COLUMNS)
          .single(),
        admin.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", input.threadId),
      ]);
      if (msgErr || !message) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const senderName =
        (message.profiles as unknown as { display_name: string } | null)?.display_name ?? "Someone";
      waitUntil(
        pushTo(admin, input.opponentId, {
          threadId: input.threadId,
          groupId: thread.group_id,
          senderName,
          body: "Challenged you to rock, paper, scissors",
          tag: message.id as string,
          messageId: message.id as string,
        }).catch(() => {}),
      );

      return message;
    }),

  // The opponent's move. The (game_id, user_id) primary key rejects a second
  // move; the status guard makes the finish atomic.
  play: protectedProcedure
    .input(z.object({ gameId: z.string().uuid(), move: MOVE }))
    .mutation(async ({ ctx, input }): Promise<RpsDetail> => {
      const { profile } = ctx;
      const admin = createAdminClient();
      const { game, moves, groupId } = await loadGame(admin, input.gameId, profile.id);

      if (game.opponent_id !== profile.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the challenged player can move" });
      }
      if (game.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "Already played" });

      const { error: insErr } = await admin
        .from("rps_moves")
        .insert({ game_id: game.id, user_id: profile.id, move: input.move });
      if (insErr) {
        throw new TRPCError({ code: insErr.code === "23505" ? "CONFLICT" : "INTERNAL_SERVER_ERROR" });
      }

      const result = resultOf(moveOf(moves, game.id, game.challenger_id), input.move);
      const winnerId = result === "challenger" ? game.challenger_id : result === "opponent" ? profile.id : null;
      const { data: updated } = await admin
        .from("rps_games")
        .update({ status: "done", winner_id: winnerId, completed_at: new Date().toISOString() })
        .eq("id", game.id)
        .eq("status", "pending")
        .select("id");
      if (!updated || updated.length === 0) throw new TRPCError({ code: "CONFLICT", message: "Already played" });

      if (game.challenger_id) {
        waitUntil(
          pushTo(admin, game.challenger_id, {
            threadId: game.thread_id,
            groupId,
            senderName: game.opponent?.display_name ?? "Someone",
            body: "Made a move — see who won",
            tag: `rps-${game.id}`,
          }).catch(() => {}),
        );
      }

      // The opponent watches the battle right after moving — that's their one view.
      await admin.from("rps_views").upsert({ game_id: game.id, user_id: profile.id }, { ignoreDuplicates: true });

      const allMoves: RpsMoveRow[] = [...moves, { game_id: game.id, user_id: profile.id, move: input.move }];
      // seen=false here so this response still plays the animation once.
      return detail({ ...game, status: "done" }, allMoves, profile.id, false);
    }),

  get: protectedProcedure
    .input(z.object({ gameId: z.string().uuid() }))
    .query(async ({ ctx, input }): Promise<RpsDetail> => {
      const admin = createAdminClient();
      const { game, moves, seen } = await loadGame(admin, input.gameId, ctx.profile.id);
      return detail(game, moves, ctx.profile.id, seen);
    }),

  // Record that the caller has watched a finished game. Called when the
  // battle animation starts; from then on the card shows the result only.
  markSeen: protectedProcedure
    .input(z.object({ gameId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient();
      const { game } = await loadGame(admin, input.gameId, ctx.profile.id);
      if (game.status !== "done") throw new TRPCError({ code: "BAD_REQUEST", message: "Game not finished" });
      await admin
        .from("rps_views")
        .upsert({ game_id: game.id, user_id: ctx.profile.id }, { ignoreDuplicates: true });
      return { ok: true };
    }),

  // Card summaries (no moves) for realtime-inserted messages and live refresh.
  getMany: protectedProcedure
    .input(z.object({ gameIds: z.array(z.string().uuid()).max(50) }))
    .query(async ({ ctx, input }): Promise<Record<string, RpsSummary>> => {
      if (input.gameIds.length === 0) return {};
      const admin = createAdminClient();
      const { data: memberships } = await admin
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", ctx.profile.id);
      const myGroups = new Set((memberships ?? []).map((m) => m.group_id as string));
      const map = await loadRpsSummaries(admin, input.gameIds, ctx.profile.id, myGroups);
      return Object.fromEntries(map);
    }),
});

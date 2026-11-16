import type { createAdminClient } from "@/lib/supabase/admin";
import { summarize, type RpsGameRow, type RpsMoveRow, type RpsSummary } from "@/lib/rps";

type Admin = ReturnType<typeof createAdminClient>;

export const RPS_GAME_COLUMNS =
  "id, thread_id, status, challenger_id, opponent_id, " +
  "challenger:profiles!rps_games_challenger_id_fkey(id, display_name, avatar_url), " +
  "opponent:profiles!rps_games_opponent_id_fkey(id, display_name, avatar_url), " +
  "threads!inner(group_id)";

export type RpsGameRecord = RpsGameRow & { thread_id: string; threads: { group_id: string } | null };

// Per-viewer summaries for a set of games. Moves are read server-side only and
// summarize() ignores them until the game is done. Pass allowedGroups to drop
// games outside the caller's groups (callers that already checked thread
// access can omit it).
export async function loadRpsSummaries(
  admin: Admin,
  gameIds: string[],
  viewerId: string,
  allowedGroups?: Set<string>,
): Promise<Map<string, RpsSummary>> {
  const map = new Map<string, RpsSummary>();
  if (gameIds.length === 0) return map;
  const [{ data: games }, { data: moves }] = await Promise.all([
    admin.from("rps_games").select(RPS_GAME_COLUMNS).in("id", gameIds),
    admin.from("rps_moves").select("game_id, user_id, move").in("game_id", gameIds),
  ]);
  for (const raw of games ?? []) {
    const g = raw as unknown as RpsGameRecord;
    const groupId = g.threads?.group_id;
    if (allowedGroups && (!groupId || !allowedGroups.has(groupId))) continue;
    map.set(g.id, summarize(g, (moves ?? []) as RpsMoveRow[], viewerId));
  }
  return map;
}

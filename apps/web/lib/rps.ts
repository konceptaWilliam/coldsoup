// Pure rock-paper-scissors helpers shared by the tRPC router, the web UI and
// the Node tests. No aliases/server-only — the tests import this file directly.

export type RpsMove = "rock" | "paper" | "scissors";
export const RPS_MOVES: readonly RpsMove[] = ["rock", "paper", "scissors"];
export const RPS_LABEL: Record<RpsMove, string> = { rock: "Rock", paper: "Paper", scissors: "Scissors" };
export const RPS_PREVIEW = "Rock, paper, scissors";

const BEATS: Record<RpsMove, RpsMove> = { rock: "scissors", paper: "rock", scissors: "paper" };

export function isRpsMove(v: unknown): v is RpsMove {
  return typeof v === "string" && (RPS_MOVES as readonly string[]).includes(v);
}

// 1 = a wins, -1 = b wins, 0 = tie
export function compareMoves(a: RpsMove, b: RpsMove): 1 | -1 | 0 {
  if (a === b) return 0;
  return BEATS[a] === b ? 1 : -1;
}

export type RpsResult = "challenger" | "opponent" | "tie";
export type RpsRole = "challenger" | "opponent" | "spectator";
export type RpsPlayer = { id: string; display_name: string; avatar_url: string | null };

// Per-viewer card data. Never carries moves.
export type RpsSummary = {
  id: string;
  status: "pending" | "done";
  challenger: RpsPlayer | null;
  opponent: RpsPlayer | null;
  result: RpsResult | null; // null while pending
  role: RpsRole; // relative to the viewer
};

export type RpsDetail = RpsSummary & {
  moves: { challenger: RpsMove | null; opponent: RpsMove | null };
};

export type RpsGameRow = {
  id: string;
  status: string;
  challenger_id: string | null;
  opponent_id: string | null;
  challenger: RpsPlayer | null;
  opponent: RpsPlayer | null;
};

export type RpsMoveRow = { game_id: string; user_id: string; move: string };

export function moveOf(moves: RpsMoveRow[], gameId: string, userId: string | null): RpsMove | null {
  if (!userId) return null;
  const m = moves.find((r) => r.game_id === gameId && r.user_id === userId)?.move;
  return isRpsMove(m) ? m : null;
}

export function resultOf(challengerMove: RpsMove | null, opponentMove: RpsMove | null): RpsResult | null {
  if (!challengerMove || !opponentMove) return null;
  const c = compareMoves(challengerMove, opponentMove);
  return c === 0 ? "tie" : c === 1 ? "challenger" : "opponent";
}

export function roleOf(viewerId: string, challengerId: string | null, opponentId: string | null): RpsRole {
  if (viewerId === challengerId) return "challenger";
  if (viewerId === opponentId) return "opponent";
  return "spectator";
}

// The result is always derived from the two moves, and only once the game is
// done — a pending game's challenger move must never influence the summary.
export function summarize(game: RpsGameRow, moves: RpsMoveRow[], viewerId: string): RpsSummary {
  const done = game.status === "done";
  return {
    id: game.id,
    status: done ? "done" : "pending",
    challenger: game.challenger,
    opponent: game.opponent,
    result: done
      ? resultOf(moveOf(moves, game.id, game.challenger_id), moveOf(moves, game.id, game.opponent_id))
      : null,
    role: roleOf(viewerId, game.challenger_id, game.opponent_id),
  };
}

export type RpsCardState = "make_move" | "waiting" | "won" | "lost" | "tie" | "view_results";

export function cardState(s: RpsSummary): RpsCardState {
  if (s.status === "pending") return s.role === "opponent" ? "make_move" : "waiting";
  if (s.role === "spectator" || !s.result) return "view_results";
  if (s.result === "tie") return "tie";
  return s.result === s.role ? "won" : "lost";
}

export function bannerText(s: Pick<RpsSummary, "result" | "challenger" | "opponent">): string {
  if (s.result === "tie") return "Tie!";
  const winner = s.result === "challenger" ? s.challenger : s.result === "opponent" ? s.opponent : null;
  return winner ? `${winner.display_name} wins!` : "No result";
}

export function canRematch(s: RpsSummary): boolean {
  return s.status === "done" && s.result === "tie" && s.role !== "spectator";
}

export function rematchOpponentId(s: RpsSummary): string | null {
  if (s.role === "challenger") return s.opponent?.id ?? null;
  if (s.role === "opponent") return s.challenger?.id ?? null;
  return null;
}

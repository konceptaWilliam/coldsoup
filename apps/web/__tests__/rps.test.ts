import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareMoves,
  isRpsMove,
  resultOf,
  roleOf,
  summarize,
  cardState,
  bannerText,
  canRematch,
  rematchOpponentId,
  type RpsGameRow,
  type RpsMoveRow,
  type RpsSummary,
} from "../lib/rps.ts";

const A = { id: "a", display_name: "Anna", avatar_url: null };
const B = { id: "b", display_name: "Bo", avatar_url: null };

function game(status: string): RpsGameRow {
  return { id: "g1", status, challenger_id: "a", opponent_id: "b", challenger: A, opponent: B };
}
function moves(a: string, b?: string): RpsMoveRow[] {
  const out: RpsMoveRow[] = [{ game_id: "g1", user_id: "a", move: a }];
  if (b) out.push({ game_id: "g1", user_id: "b", move: b });
  return out;
}
function summary(over: Partial<RpsSummary>): RpsSummary {
  return { id: "g1", status: "done", challenger: A, opponent: B, result: "tie", role: "spectator", ...over };
}

test("compareMoves: all nine pairs", () => {
  assert.equal(compareMoves("rock", "scissors"), 1);
  assert.equal(compareMoves("scissors", "paper"), 1);
  assert.equal(compareMoves("paper", "rock"), 1);
  assert.equal(compareMoves("scissors", "rock"), -1);
  assert.equal(compareMoves("paper", "scissors"), -1);
  assert.equal(compareMoves("rock", "paper"), -1);
  assert.equal(compareMoves("rock", "rock"), 0);
  assert.equal(compareMoves("paper", "paper"), 0);
  assert.equal(compareMoves("scissors", "scissors"), 0);
});

test("isRpsMove", () => {
  assert.equal(isRpsMove("rock"), true);
  assert.equal(isRpsMove("lizard"), false);
  assert.equal(isRpsMove(null), false);
});

test("resultOf", () => {
  assert.equal(resultOf("rock", "scissors"), "challenger");
  assert.equal(resultOf("rock", "paper"), "opponent");
  assert.equal(resultOf("paper", "paper"), "tie");
  assert.equal(resultOf("rock", null), null);
});

test("roleOf", () => {
  assert.equal(roleOf("a", "a", "b"), "challenger");
  assert.equal(roleOf("b", "a", "b"), "opponent");
  assert.equal(roleOf("c", "a", "b"), "spectator");
});

test("summarize: pending game never exposes a result", () => {
  const s = summarize(game("pending"), moves("rock"), "c");
  assert.equal(s.status, "pending");
  assert.equal(s.result, null);
  assert.equal(s.role, "spectator");
});

test("summarize: done game derives result from moves", () => {
  assert.equal(summarize(game("done"), moves("rock", "paper"), "a").result, "opponent");
  assert.equal(summarize(game("done"), moves("scissors", "paper"), "b").result, "challenger");
  assert.equal(summarize(game("done"), moves("rock", "rock"), "c").result, "tie");
});

test("summarize: ignores moves from other games", () => {
  const other: RpsMoveRow[] = [{ game_id: "g2", user_id: "b", move: "paper" }];
  assert.equal(summarize(game("done"), [...moves("rock"), ...other], "a").result, null);
});

test("cardState", () => {
  assert.equal(cardState(summary({ status: "pending", result: null, role: "opponent" })), "make_move");
  assert.equal(cardState(summary({ status: "pending", result: null, role: "challenger" })), "waiting");
  assert.equal(cardState(summary({ status: "pending", result: null, role: "spectator" })), "waiting");
  assert.equal(cardState(summary({ result: "challenger", role: "challenger" })), "won");
  assert.equal(cardState(summary({ result: "challenger", role: "opponent" })), "lost");
  assert.equal(cardState(summary({ result: "opponent", role: "opponent" })), "won");
  assert.equal(cardState(summary({ result: "tie", role: "challenger" })), "tie");
  assert.equal(cardState(summary({ result: "challenger", role: "spectator" })), "view_results");
  assert.equal(cardState(summary({ result: null, role: "challenger" })), "view_results");
});

test("bannerText", () => {
  assert.equal(bannerText(summary({ result: "tie" })), "Tie!");
  assert.equal(bannerText(summary({ result: "challenger" })), "Anna wins!");
  assert.equal(bannerText(summary({ result: "opponent" })), "Bo wins!");
  assert.equal(bannerText(summary({ result: null })), "No result");
});

test("canRematch + rematchOpponentId", () => {
  assert.equal(canRematch(summary({ result: "tie", role: "challenger" })), true);
  assert.equal(canRematch(summary({ result: "tie", role: "opponent" })), true);
  assert.equal(canRematch(summary({ result: "tie", role: "spectator" })), false);
  assert.equal(canRematch(summary({ result: "challenger", role: "challenger" })), false);
  assert.equal(canRematch(summary({ status: "pending", result: null, role: "opponent" })), false);
  assert.equal(rematchOpponentId(summary({ role: "challenger" })), "b");
  assert.equal(rematchOpponentId(summary({ role: "opponent" })), "a");
  assert.equal(rematchOpponentId(summary({ role: "spectator" })), null);
});

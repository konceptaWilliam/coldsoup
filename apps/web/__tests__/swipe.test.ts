import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldCommitSwipe, SWIPE_EDGE_PX, SWIPE_LOCK_PX } from "../lib/swipe.ts";

const W = 400;

test("shouldCommitSwipe: past 35% of width commits", () => {
  assert.equal(shouldCommitSwipe({ dx: 141, width: W, velocity: 0 }), true);
});

test("shouldCommitSwipe: exactly 35% does not commit", () => {
  assert.equal(shouldCommitSwipe({ dx: 140, width: W, velocity: 0 }), false);
});

test("shouldCommitSwipe: a fast flick commits below the distance threshold", () => {
  assert.equal(shouldCommitSwipe({ dx: 60, width: W, velocity: 0.6 }), true);
});

test("shouldCommitSwipe: velocity exactly 0.5 does not commit", () => {
  assert.equal(shouldCommitSwipe({ dx: 60, width: W, velocity: 0.5 }), false);
});

test("shouldCommitSwipe: a flick needs at least 40px of travel", () => {
  assert.equal(shouldCommitSwipe({ dx: 30, width: W, velocity: 2 }), false);
});

test("shouldCommitSwipe: leftward or zero never commits", () => {
  assert.equal(shouldCommitSwipe({ dx: 0, width: W, velocity: 1 }), false);
  assert.equal(shouldCommitSwipe({ dx: -200, width: W, velocity: 1 }), false);
});

test("constants", () => {
  assert.equal(SWIPE_EDGE_PX, 24);
  assert.equal(SWIPE_LOCK_PX, 8);
});

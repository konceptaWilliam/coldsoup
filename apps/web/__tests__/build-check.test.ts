import { test } from "node:test";
import assert from "node:assert/strict";
import { isStaleBuild } from "../lib/build-check.ts";

test("isStaleBuild: a different live build is stale", () => {
  assert.equal(isStaleBuild("a", "b", null), true);
});

test("isStaleBuild: same build, or nothing to compare", () => {
  assert.equal(isStaleBuild("a", "a", null), false);
  assert.equal(isStaleBuild(undefined, "b", null), false);
  assert.equal(isStaleBuild("a", null, null), false);
  assert.equal(isStaleBuild("a", "", null), false);
  assert.equal(isStaleBuild("a", 42, null), false);
});

test("isStaleBuild: never reloads twice for the same build", () => {
  assert.equal(isStaleBuild("a", "b", "b"), false);
  assert.equal(isStaleBuild("a", "c", "b"), true);
});

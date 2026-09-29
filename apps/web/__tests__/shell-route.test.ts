import { test } from "node:test";
import assert from "node:assert/strict";
import { parseShellRoute, isShellPath } from "../lib/shell-route.ts";

const G = "11111111-2222-3333-4444-555555555555";
const T = "66666666-7777-8888-9999-000000000000";

test("parseShellRoute: group only", () => {
  assert.deepEqual(parseShellRoute(`/g/${G}`), { groupId: G, threadId: null });
});

test("parseShellRoute: group with trailing slash", () => {
  assert.deepEqual(parseShellRoute(`/g/${G}/`), { groupId: G, threadId: null });
});

test("parseShellRoute: group and thread", () => {
  assert.deepEqual(parseShellRoute(`/g/${G}/t/${T}`), { groupId: G, threadId: T });
});

test("parseShellRoute: thread with trailing slash", () => {
  assert.deepEqual(parseShellRoute(`/g/${G}/t/${T}/`), { groupId: G, threadId: T });
});

test("parseShellRoute: non-shell paths", () => {
  for (const p of ["/", "/settings", "/g", "/g/", `/g/${G}/t`, `/g/${G}/t/`, `/g/${G}/x/${T}`, `/gx/${G}`]) {
    assert.deepEqual(parseShellRoute(p), { groupId: null, threadId: null }, p);
  }
});

test("isShellPath: ignores query and hash", () => {
  assert.equal(isShellPath(`/g/${G}/t/${T}?highlight=abc`), true);
  assert.equal(isShellPath(`/g/${G}#x`), true);
  assert.equal(isShellPath("/settings?x=1"), false);
});

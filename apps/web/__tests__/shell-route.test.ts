import { test } from "node:test";
import assert from "node:assert/strict";
import { parseShellRoute, isShellPath, planNavigation, resolvePop } from "../lib/shell-route.ts";

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

const G2 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const T2 = "ffffffff-0000-1111-2222-333333333333";

test("planNavigation: list -> thread pushes", () => {
  assert.equal(planNavigation(0, `/g/${G}/t/${T}`), "push");
  assert.equal(planNavigation(0, `/g/${G}/t/${T}?highlight=m1`), "push");
});

test("planNavigation: thread -> thread replaces", () => {
  assert.equal(planNavigation(1, `/g/${G}/t/${T2}`), "replace");
  assert.equal(planNavigation(1, `/g/${G2}/t/${T2}?highlight=m1`), "replace");
});

test("planNavigation: list -> list replaces", () => {
  assert.equal(planNavigation(0, `/g/${G2}`), "replace");
});

test("planNavigation: thread -> list goes back", () => {
  assert.equal(planNavigation(1, `/g/${G2}`), "back");
});

test("planNavigation: legacy deep stacks count as thread level", () => {
  assert.equal(planNavigation(3, `/g/${G}/t/${T}`), "replace");
  assert.equal(planNavigation(3, `/g/${G}`), "back");
});

test("resolvePop: back from thread onto its own list is left alone", () => {
  assert.equal(resolvePop({ groupId: G, threadId: T }, `/g/${G}`, null), null);
});

test("resolvePop: back from thread onto another group's list is corrected", () => {
  assert.equal(resolvePop({ groupId: G, threadId: T }, `/g/${G2}`, null), `/g/${G}`);
});

test("resolvePop: back from thread onto another thread is corrected", () => {
  assert.equal(resolvePop({ groupId: G, threadId: T }, `/g/${G}/t/${T2}`, null), `/g/${G}`);
  assert.equal(resolvePop({ groupId: G, threadId: T }, `/g/${G2}/t/${T2}?highlight=m1`, null), `/g/${G}`);
});

test("resolvePop: pending target wins", () => {
  assert.equal(resolvePop({ groupId: G, threadId: T }, `/g/${G}`, `/g/${G2}`), `/g/${G2}`);
  assert.equal(resolvePop({ groupId: G, threadId: T }, `/g/${G2}`, `/g/${G2}`), null);
});

test("resolvePop: leaving the shell is left alone", () => {
  assert.equal(resolvePop({ groupId: G, threadId: T }, "/settings", null), null);
  assert.equal(resolvePop({ groupId: G, threadId: T }, "/settings", `/g/${G2}`), null);
});

test("resolvePop: pops that did not start in a thread are left alone", () => {
  assert.equal(resolvePop({ groupId: G, threadId: null }, `/g/${G2}`, null), null);
  assert.equal(resolvePop(null, `/g/${G2}`, null), null);
});

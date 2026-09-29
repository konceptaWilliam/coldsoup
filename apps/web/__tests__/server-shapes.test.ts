import { test } from "node:test";
import assert from "node:assert/strict";
import { toUnreadMap, accessibleByGroup } from "../lib/server-shapes.ts";

test("toUnreadMap maps rows to a record", () => {
  assert.deepEqual(
    toUnreadMap([
      { group_id: "g1", unread: 3, urgent: 1 },
      { group_id: "g2", unread: 1, urgent: 0 },
    ]),
    { g1: { unread: 3, urgent: 1 }, g2: { unread: 1, urgent: 0 } },
  );
  assert.deepEqual(toUnreadMap([]), {});
});

test("accessibleByGroup keeps items in the caller's groups only", () => {
  const items = [
    { id: "a", g: "g1" },
    { id: "b", g: "g2" },
    { id: "c", g: null },
  ];
  const out = accessibleByGroup(items, (i) => i.g, new Set(["g1"]));
  assert.deepEqual(out.map((i) => i.id), ["a"]);
});

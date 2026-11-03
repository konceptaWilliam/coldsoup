import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isStockholmHour,
  groupPending,
  reminderBatches,
  REMINDER_TITLE,
  type PendingRow,
} from "../lib/smeter-reminders.ts";

test("isStockholmHour: winter (CET, UTC+1)", () => {
  assert.equal(isStockholmHour(new Date("2026-01-15T08:00:00Z"), 9), true);
  assert.equal(isStockholmHour(new Date("2026-01-15T08:59:00Z"), 9), true);
  assert.equal(isStockholmHour(new Date("2026-01-15T07:00:00Z"), 9), false);
});

test("isStockholmHour: summer (CEST, UTC+2)", () => {
  assert.equal(isStockholmHour(new Date("2026-07-15T07:00:00Z"), 9), true);
  assert.equal(isStockholmHour(new Date("2026-07-15T07:59:00Z"), 9), true);
  assert.equal(isStockholmHour(new Date("2026-07-15T08:00:00Z"), 9), false);
});

test("groupPending: counts per thread and collects groups", () => {
  const out = groupPending([
    { threadId: "t1", groupId: "g1" },
    { threadId: "t1", groupId: "g1" },
    { threadId: "t2", groupId: "g2" },
  ]);
  assert.deepEqual(out.byThread, { t1: 2, t2: 1 });
  assert.deepEqual([...out.groups].sort(), ["g1", "g2"]);
});

test("groupPending: empty", () => {
  const out = groupPending([]);
  assert.deepEqual(out.byThread, {});
  assert.equal(out.groups.size, 0);
});

const row = (over: Partial<PendingRow>): PendingRow => ({
  user_id: "u1",
  smeter_id: "s1",
  thread_id: "t1",
  group_id: "g1",
  message_id: "m1",
  title: null,
  thread_title: "fredag",
  group_name: "coldsoup",
  ...over,
});

test("reminderBatches: one batch per S-meter with all its pending users", () => {
  const out = reminderBatches([
    row({ user_id: "u1" }),
    row({ user_id: "u2" }),
    row({ user_id: "u1", smeter_id: "s2", message_id: "m2", title: "Resa" }),
  ]);
  assert.equal(out.length, 2);
  const s1 = out.find((b) => b.smeterId === "s1")!;
  assert.deepEqual(s1.userIds, ["u1", "u2"]);
  assert.equal(s1.threadId, "t1");
  assert.equal(s1.groupId, "g1");
  assert.equal(s1.messageId, "m1");
  assert.equal(s1.location, ".coldsoup#fredag");
  assert.equal(s1.webBody, ".coldsoup#fredag");
  assert.equal(s1.expoBody, "Tryck för att svara");
  const s2 = out.find((b) => b.smeterId === "s2")!;
  assert.equal(s2.webBody, ".coldsoup#fredag\nResa");
  assert.equal(s2.expoBody, "Resa");
});

test("reminderBatches: null names fall back to empty", () => {
  const [b] = reminderBatches([row({ thread_title: null, group_name: null })]);
  assert.equal(b.location, ".#");
});

test("reminderBatches: empty", () => {
  assert.deepEqual(reminderBatches([]), []);
});

test("REMINDER_TITLE", () => {
  assert.equal(REMINDER_TITLE, "Du har en obesvarad S-mätare!");
});

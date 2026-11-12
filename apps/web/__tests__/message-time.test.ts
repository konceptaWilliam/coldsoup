import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMessageTime } from "../lib/message-time.ts";

// Local-time constructors so the test is time-zone independent.
const now = new Date(2026, 10, 12, 15, 0);
const at = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m, d, h, min).toISOString();

test("today shows only the time", () => {
  assert.equal(formatMessageTime(at(2026, 10, 12, 9, 5), now), "09:05");
  assert.equal(formatMessageTime(at(2026, 10, 12, 0, 0), now), "00:00");
});

test("yesterday is labelled", () => {
  assert.equal(formatMessageTime(at(2026, 10, 11, 23, 59), now), "Yesterday 23:59");
});

test("earlier this year shows day + month", () => {
  assert.equal(formatMessageTime(at(2026, 10, 3, 14, 32), now), "3 Nov 14:32");
});

test("previous years include the year", () => {
  assert.equal(formatMessageTime(at(2025, 11, 31, 8, 0), now), "31 Dec 2025 08:00");
});

test("yesterday across a month boundary", () => {
  const first = new Date(2026, 11, 1, 10, 0);
  assert.equal(formatMessageTime(at(2026, 10, 30, 22, 0), first), "Yesterday 22:00");
});

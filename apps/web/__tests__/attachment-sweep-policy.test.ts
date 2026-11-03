import { test } from "node:test";
import assert from "node:assert/strict";
import { findOrphans, type StoredObject } from "../lib/attachment-sweep-policy.ts";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const obj = (path: string, ageMs: number, sizeBytes = 100): StoredObject => ({
  path,
  sizeBytes,
  createdAt: new Date(NOW - ageMs).toISOString(),
});

test("findOrphans: referenced file is kept", () => {
  const objects = [obj("u/a.mp4", 48 * HOUR)];
  assert.deepEqual(findOrphans(objects, new Set(["u/a.mp4"]), NOW), []);
});

test("findOrphans: new unreferenced file is kept (may be in the outbox)", () => {
  const objects = [obj("u/a.mp4", 2 * HOUR)];
  assert.deepEqual(findOrphans(objects, new Set(), NOW), []);
});

test("findOrphans: old unreferenced file is an orphan", () => {
  const objects = [obj("u/a.mp4", 48 * HOUR)];
  assert.deepEqual(findOrphans(objects, new Set(), NOW), objects);
});

test("findOrphans: file referenced only by a deleted message is an orphan", () => {
  // The caller builds `referenced` from live messages only, so a deleted
  // message's file is simply absent from the set.
  const live = obj("u/live.jpg", 48 * HOUR);
  const fromDeleted = obj("u/deleted.jpg", 48 * HOUR);
  assert.deepEqual(findOrphans([live, fromDeleted], new Set(["u/live.jpg"]), NOW), [fromDeleted]);
});

test("findOrphans: unparseable createdAt is kept", () => {
  const objects: StoredObject[] = [{ path: "u/a.mp4", sizeBytes: 1, createdAt: "garbage" }];
  assert.deepEqual(findOrphans(objects, new Set(), NOW), []);
});

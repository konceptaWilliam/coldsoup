import { test } from "node:test";
import assert from "node:assert/strict";
import { rowPropsEqual, EMPTY_READERS } from "../lib/row-props-equal.ts";

const actions = {};
const msg = { id: "m1" };
const base = { msg, isOwn: true, seenReaders: [{ id: "u1", name: "A" }], actions, copied: false };

test("identical props are equal", () => {
  assert.equal(rowPropsEqual(base, { ...base }), true);
});

test("seenReaders with the same ids in a new array are equal", () => {
  assert.equal(rowPropsEqual(base, { ...base, seenReaders: [{ id: "u1", name: "A" }] }), true);
});

test("different reader ids are not equal", () => {
  assert.equal(rowPropsEqual(base, { ...base, seenReaders: [{ id: "u2", name: "B" }] }), false);
  assert.equal(rowPropsEqual(base, { ...base, seenReaders: EMPTY_READERS }), false);
});

test("a new msg object is not equal", () => {
  assert.equal(rowPropsEqual(base, { ...base, msg: { id: "m1" } }), false);
});

test("a different actions identity is not equal", () => {
  assert.equal(rowPropsEqual(base, { ...base, actions: {} }), false);
});

test("a changed primitive is not equal", () => {
  assert.equal(rowPropsEqual(base, { ...base, copied: true }), false);
});

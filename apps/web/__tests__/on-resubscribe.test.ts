import { test } from "node:test";
import assert from "node:assert/strict";
import { onResubscribe } from "../lib/on-resubscribe.ts";

test("onResubscribe: first SUBSCRIBED is the initial join, not a reconnect", () => {
  let calls = 0;
  const cb = onResubscribe(() => calls++);
  cb("SUBSCRIBED");
  assert.equal(calls, 0);
});

test("onResubscribe: every later SUBSCRIBED is a reconnect", () => {
  let calls = 0;
  const cb = onResubscribe(() => calls++);
  cb("SUBSCRIBED");
  cb("CHANNEL_ERROR");
  cb("SUBSCRIBED");
  cb("TIMED_OUT");
  cb("CLOSED");
  cb("SUBSCRIBED");
  assert.equal(calls, 2);
});

test("onResubscribe: non-SUBSCRIBED statuses never fire", () => {
  let calls = 0;
  const cb = onResubscribe(() => calls++);
  for (const s of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]) cb(s);
  assert.equal(calls, 0);
});

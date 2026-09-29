import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldPersistQuery } from "../lib/persist-policy.ts";

const key = (path: string[], type = "query") => [path, { input: {}, type }];

test("whitelisted successful queries are persisted", () => {
  assert.equal(shouldPersistQuery(key(["messages", "list"], "infinite"), "success"), true);
  assert.equal(shouldPersistQuery(key(["threads", "list"]), "success"), true);
  assert.equal(shouldPersistQuery(key(["notifications", "prefs"]), "success"), true);
});

test("errors and pending are not persisted", () => {
  assert.equal(shouldPersistQuery(key(["threads", "list"]), "error"), false);
  assert.equal(shouldPersistQuery(key(["threads", "list"]), "pending"), false);
});

test("one-off keys are not persisted", () => {
  assert.equal(shouldPersistQuery(key(["threads", "unreadCounts"]), "success"), false);
  assert.equal(shouldPersistQuery(key(["links", "unfurl"]), "success"), false);
  assert.equal(shouldPersistQuery(key(["threads", "reads"]), "success"), false);
});

test("malformed keys are not persisted", () => {
  assert.equal(shouldPersistQuery("threads.list", "success"), false);
  assert.equal(shouldPersistQuery([], "success"), false);
  assert.equal(shouldPersistQuery([[1, 2]], "success"), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { isChunkError } from "../lib/chunk-reload.ts";

test("isChunkError recognises webpack and native chunk failures", () => {
  assert.equal(isChunkError({ name: "ChunkLoadError", message: "x" }), true);
  assert.equal(isChunkError({ message: "Loading chunk 123 failed." }), true);
  assert.equal(isChunkError({ message: "Loading chunk app-thread failed" }), true);
  assert.equal(isChunkError({ message: "Failed to fetch dynamically imported module: /x.js" }), true);
});

test("isChunkError ignores other errors", () => {
  assert.equal(isChunkError({ name: "TypeError", message: "x is undefined" }), false);
  assert.equal(isChunkError(null), false);
  assert.equal(isChunkError("boom"), false);
});

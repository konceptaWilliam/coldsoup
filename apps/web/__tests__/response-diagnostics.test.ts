import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeBody } from "../lib/response-diagnostics.ts";

test("empty body", () => {
  assert.deepEqual(summarizeBody(""), { length: 0, looksLikeJson: false, snippet: "" });
});

test("HTML / plain-text error pages get a snippet", () => {
  const html = "<!DOCTYPE html><html><head><title>504</title>";
  assert.deepEqual(summarizeBody(html), {
    length: html.length,
    looksLikeJson: false,
    snippet: html,
  });
  const plain = "An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT";
  assert.equal(summarizeBody(plain).snippet, plain);
});

test("snippet is capped at 200 chars", () => {
  const long = "x".repeat(500);
  assert.equal(summarizeBody(long).snippet.length, 200);
});

test("truncated JSON never logs content (may hold private messages)", () => {
  const truncated = '[{"result":{"data":{"json":{"body":"secret message';
  assert.deepEqual(summarizeBody(truncated), {
    length: truncated.length,
    looksLikeJson: true,
    snippet: "",
  });
  assert.equal(summarizeBody('  {"a":').looksLikeJson, true);
});

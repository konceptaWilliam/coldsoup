import { test } from "node:test";
import assert from "node:assert/strict";
import { aspectStyle } from "../lib/media.ts";

test("aspectStyle: valid dimensions give a ratio", () => {
  assert.deepEqual(aspectStyle({ width: 1600, height: 900 }), { aspectRatio: "1600 / 900" });
});

test("aspectStyle: missing, zero, negative or non-finite give {}", () => {
  assert.deepEqual(aspectStyle({}), {});
  assert.deepEqual(aspectStyle({ width: 0, height: 10 }), {});
  assert.deepEqual(aspectStyle({ width: -5, height: 10 }), {});
  assert.deepEqual(aspectStyle({ width: Infinity, height: 10 }), {});
  assert.deepEqual(aspectStyle({ width: 10 }), {});
});

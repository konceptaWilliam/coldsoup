import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveBlobatar,
  NEUTRAL_SEED,
  NEUTRAL_PALETTE,
  MIN_ANIMATED_SIZE,
} from "../lib/avatar.ts";

const UUID = "11111111-2222-3333-4444-555555555555";

test("seeds from user id", () => {
  assert.deepEqual(resolveBlobatar({ userId: UUID, size: 28 }), { name: UUID });
});

test("null / empty / whitespace id → neutral blob", () => {
  for (const userId of [null, undefined, "", "  "]) {
    assert.deepEqual(resolveBlobatar({ userId, size: 28 }), {
      name: NEUTRAL_SEED,
      palette: NEUTRAL_PALETTE,
    });
  }
});

test("animate kept at or above min size", () => {
  assert.deepEqual(
    resolveBlobatar({ userId: UUID, size: MIN_ANIMATED_SIZE, animate: "hover" }),
    { name: UUID, animate: "hover" },
  );
});

test("animate dropped below min size", () => {
  assert.deepEqual(
    resolveBlobatar({ userId: UUID, size: MIN_ANIMATED_SIZE - 1, animate: "always" }),
    { name: UUID },
  );
});

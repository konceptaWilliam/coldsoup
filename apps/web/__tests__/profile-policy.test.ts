import { test } from "node:test";
import assert from "node:assert/strict";
import { profileUpdateInput } from "../lib/profile-policy.ts";

test("display name update accepted", () => {
  assert.deepEqual(profileUpdateInput.parse({ displayName: "Anna" }), {
    displayName: "Anna",
  });
});

test("avatarUrl rejected — avatars are blobatars only", () => {
  for (const avatarUrl of ["https://x.supabase.co/storage/v1/object/public/avatars/a.jpg", null]) {
    assert.equal(profileUpdateInput.safeParse({ avatarUrl }).success, false);
    assert.equal(
      profileUpdateInput.safeParse({ displayName: "Anna", avatarUrl }).success,
      false,
    );
  }
});

test("display name bounds unchanged", () => {
  assert.equal(profileUpdateInput.safeParse({ displayName: "" }).success, false);
  assert.equal(profileUpdateInput.safeParse({ displayName: "x".repeat(21) }).success, false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { needsPasswordCheck, PW_OK_COOKIE } from "../lib/password-gate.ts";

const UID = "11111111-2222-3333-4444-555555555555";

test("needsPasswordCheck: cookie for this user skips the check", () => {
  assert.equal(needsPasswordCheck(UID, UID), false);
});

test("needsPasswordCheck: missing cookie requires the check", () => {
  assert.equal(needsPasswordCheck(undefined, UID), true);
});

test("needsPasswordCheck: cookie for another user requires the check", () => {
  assert.equal(needsPasswordCheck("99999999-2222-3333-4444-555555555555", UID), true);
});

test("PW_OK_COOKIE: stable cookie name", () => {
  assert.equal(PW_OK_COOKIE, "cs_pw_ok");
});

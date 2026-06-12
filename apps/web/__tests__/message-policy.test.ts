import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidAttachmentUrl,
  escapeLike,
  isMentioned,
  mentionsEveryone,
  shouldNotify,
} from "../lib/message-policy.ts";

const HOST = "https://abc123.supabase.co";
const UUID = "11111111-2222-3333-4444-555555555555";

test("isValidAttachmentUrl: accepts a well-formed public attachment URL", () => {
  const url = `${HOST}/storage/v1/object/public/attachments/${UUID}/photo.jpg`;
  assert.equal(isValidAttachmentUrl(url, HOST), true);
});

test("isValidAttachmentUrl: rejects a foreign host", () => {
  const url = `https://evil.example.com/storage/v1/object/public/attachments/${UUID}/photo.jpg`;
  assert.equal(isValidAttachmentUrl(url, HOST), false);
});

test("isValidAttachmentUrl: rejects a disallowed extension", () => {
  const url = `${HOST}/storage/v1/object/public/attachments/${UUID}/x.exe`;
  assert.equal(isValidAttachmentUrl(url, HOST), false);
});

test("isValidAttachmentUrl: rejects path traversal / wrong prefix", () => {
  const url = `${HOST}/storage/v1/object/public/avatars/${UUID}/x.png`;
  assert.equal(isValidAttachmentUrl(url, HOST), false);
});

test("isValidAttachmentUrl: rejects a non-uuid folder", () => {
  const url = `${HOST}/storage/v1/object/public/attachments/not-a-uuid/x.png`;
  assert.equal(isValidAttachmentUrl(url, HOST), false);
});

test("isValidAttachmentUrl: rejects garbage input", () => {
  assert.equal(isValidAttachmentUrl("not a url", HOST), false);
});

test("escapeLike: escapes LIKE wildcards and the escape char", () => {
  assert.equal(escapeLike("50%"), "50\\%");
  assert.equal(escapeLike("a_b"), "a\\_b");
  assert.equal(escapeLike("a\\b"), "a\\\\b");
  assert.equal(escapeLike("plain"), "plain");
});

test("mentionsEveryone: detects @everyone and @here", () => {
  assert.equal(mentionsEveryone("hey @everyone"), true);
  assert.equal(mentionsEveryone("@here ping"), true);
  assert.equal(mentionsEveryone("nothing here"), false);
});

test("isMentioned: matches a member by name, case-insensitive", () => {
  assert.equal(isMentioned("ping @Anna please", "Anna"), true);
  assert.equal(isMentioned("ping @anna please", "Anna"), true);
  assert.equal(isMentioned("no mention", "Anna"), false);
});

test("isMentioned: @everyone mentions everyone regardless of name", () => {
  assert.equal(isMentioned("@everyone heads up", "Bob"), true);
  assert.equal(isMentioned("hi", null), false);
});

test("shouldNotify: paused user never notified", () => {
  assert.equal(
    shouldNotify({ paused: true, level: "ALL", threadMuted: false, mentioned: true }),
    false,
  );
});

test("shouldNotify: level NONE never notified", () => {
  assert.equal(
    shouldNotify({ paused: false, level: "NONE", threadMuted: false, mentioned: true }),
    false,
  );
});

test("shouldNotify: level MENTIONS only on mention", () => {
  assert.equal(
    shouldNotify({ paused: false, level: "MENTIONS", threadMuted: false, mentioned: false }),
    false,
  );
  assert.equal(
    shouldNotify({ paused: false, level: "MENTIONS", threadMuted: false, mentioned: true }),
    true,
  );
});

test("shouldNotify: thread mute suppresses, but a mention bypasses it", () => {
  assert.equal(
    shouldNotify({ paused: false, level: "ALL", threadMuted: true, mentioned: false }),
    false,
  );
  assert.equal(
    shouldNotify({ paused: false, level: "ALL", threadMuted: true, mentioned: true }),
    true,
  );
});

test("shouldNotify: default ALL, unmuted, notified", () => {
  assert.equal(
    shouldNotify({ paused: false, level: "ALL", threadMuted: false, mentioned: false }),
    true,
  );
});

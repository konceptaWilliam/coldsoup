import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidAttachmentUrl,
  attachmentPathFromUrl,
  escapeLike,
  isMentioned,
  mentionsEveryone,
  shouldNotify,
  buildCatchUp,
  type CatchUpThread,
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

const OTHER = "99999999-8888-7777-6666-555555555555";

test("attachmentPathFromUrl: returns the object path for a valid URL", () => {
  const url = `${HOST}/storage/v1/object/public/attachments/${UUID}/abc.mp4`;
  assert.equal(attachmentPathFromUrl(url, HOST), `${UUID}/abc.mp4`);
});

test("attachmentPathFromUrl: owner check passes for the owner", () => {
  const url = `${HOST}/storage/v1/object/public/attachments/${UUID}/abc.mp4`;
  assert.equal(attachmentPathFromUrl(url, HOST, UUID), `${UUID}/abc.mp4`);
});

test("attachmentPathFromUrl: owner check rejects another user's file", () => {
  const url = `${HOST}/storage/v1/object/public/attachments/${UUID}/abc.mp4`;
  assert.equal(attachmentPathFromUrl(url, HOST, OTHER), null);
});

test("attachmentPathFromUrl: rejects a foreign host", () => {
  const url = `https://evil.example.com/storage/v1/object/public/attachments/${UUID}/abc.mp4`;
  assert.equal(attachmentPathFromUrl(url, HOST), null);
});

test("attachmentPathFromUrl: rejects another bucket", () => {
  const url = `${HOST}/storage/v1/object/public/avatars/${UUID}/abc.png`;
  assert.equal(attachmentPathFromUrl(url, HOST), null);
});

test("attachmentPathFromUrl: rejects encoded path separators", () => {
  const url = `${HOST}/storage/v1/object/public/attachments/${UUID}/..%2F..%2Fx.png`;
  assert.equal(attachmentPathFromUrl(url, HOST), null);
});

test("attachmentPathFromUrl: rejects garbage input", () => {
  assert.equal(attachmentPathFromUrl("not a url", HOST), null);
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

// --- buildCatchUp ----------------------------------------------------------

const T0 = "2026-07-01T10:00:00.000Z";
const T1 = "2026-07-01T11:00:00.000Z";
const T2 = "2026-07-01T12:00:00.000Z";
const ms = (iso: string) => new Date(iso).getTime();

function th(over: Partial<CatchUpThread> & { id: string }): CatchUpThread {
  return {
    title: over.id,
    group_id: "g1",
    group_name: "grp",
    status: "OPEN",
    updated_at: T1,
    ...over,
  };
}

test("buildCatchUp: a thread updated after its read marker is unread", () => {
  const out = buildCatchUp([th({ id: "a", updated_at: T2 })], { a: ms(T1) });
  assert.equal(out.unreadTotal, 1);
});

test("buildCatchUp: a thread read at/after its update is not unread", () => {
  const out = buildCatchUp([th({ id: "a", updated_at: T1 })], { a: ms(T1) });
  assert.equal(out.unreadTotal, 0);
  assert.equal(out.urgentTotal, 0);
});

test("buildCatchUp: missing read marker means never read (unread)", () => {
  const out = buildCatchUp([th({ id: "a", updated_at: T0 })], {});
  assert.equal(out.unreadTotal, 1);
});

test("buildCatchUp: DONE threads are excluded from unreadTotal", () => {
  const out = buildCatchUp(
    [th({ id: "a", status: "DONE", updated_at: T2 })],
    {},
  );
  assert.equal(out.unreadTotal, 0);
});

test("buildCatchUp: urgentTotal counts only unread URGENT threads", () => {
  const out = buildCatchUp(
    [
      th({ id: "a", status: "URGENT", updated_at: T2 }), // unread urgent
      th({ id: "b", status: "URGENT", updated_at: T1 }), // read (marker == update)
      th({ id: "c", status: "OPEN", updated_at: T2 }), // unread but not urgent
    ],
    { b: ms(T1) },
  );
  assert.equal(out.urgentTotal, 1);
  assert.equal(out.urgentThreads.map((t) => t.id).join(","), "a");
  assert.equal(out.unreadTotal, 2); // a + c
});

test("buildCatchUp: urgentThreads sorted newest-first and capped", () => {
  const out = buildCatchUp(
    [
      th({ id: "old", status: "URGENT", updated_at: T0 }),
      th({ id: "new", status: "URGENT", updated_at: T2 }),
      th({ id: "mid", status: "URGENT", updated_at: T1 }),
    ],
    {},
    { urgentLimit: 2 },
  );
  assert.equal(out.urgentTotal, 3);
  assert.equal(out.urgentThreads.map((t) => t.id).join(","), "new,mid");
});

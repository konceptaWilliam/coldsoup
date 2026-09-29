import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flatten,
  upsertMessage,
  patchMessage,
  applyReaction,
  patchPoll,
  patchSmeter,
  findPollIdByOption,
  mergeLatest,
  trimForPersist,
  trimPersistedMessages,
  mergePending,
  nextToDispatch,
  type CacheMessage,
  type ThreadPages,
} from "../lib/thread-cache.ts";

const R = () => ["👍", "❤️"].map((type) => ({ type, count: 0, userReacted: false, users: [] as string[] }));

function msg(id: string, minute: number, extra: Partial<CacheMessage> = {}): CacheMessage {
  return {
    id,
    created_at: new Date(Date.UTC(2026, 8, 29, 10, minute)).toISOString(),
    client_id: null,
    reactions: R(),
    poll_id: null,
    poll: null,
    smeter_id: null,
    smeter: null,
    ...extra,
  };
}

// pages[0] = newest (minutes 10..12), pages[1] = older (minutes 1..3)
function twoPages(): ThreadPages<CacheMessage> {
  return {
    pages: [
      { messages: [msg("c1", 10), msg("c2", 11), msg("c3", 12)], hasMore: true },
      { messages: [msg("a1", 1), msg("a2", 2), msg("a3", 3)], hasMore: false },
    ],
    pageParams: [undefined, "cursor-1"],
  };
}

const ids = (d: ThreadPages<CacheMessage>) => flatten(d).map((m) => m.id);

test("flatten: oldest page first, ascending", () => {
  assert.deepEqual(ids(twoPages()), ["a1", "a2", "a3", "c1", "c2", "c3"]);
  assert.deepEqual(flatten(undefined), []);
});

test("upsertMessage: new message appends to the newest page", () => {
  const d = upsertMessage(twoPages(), msg("n", 20));
  assert.deepEqual(d.pages[0].messages.map((m) => m.id), ["c1", "c2", "c3", "n"]);
});

test("upsertMessage: existing id is replaced in place", () => {
  const d = upsertMessage(twoPages(), { ...msg("c2", 11), client_id: "x" });
  assert.equal(d.pages[0].messages[1].client_id, "x");
  assert.equal(ids(d).length, 6);
});

test("upsertMessage: out-of-order timestamp is inserted in order", () => {
  const d = upsertMessage(twoPages(), msg("mid", 11, { created_at: new Date(Date.UTC(2026, 8, 29, 10, 10, 30)).toISOString() }));
  assert.deepEqual(d.pages[0].messages.map((m) => m.id), ["c1", "mid", "c2", "c3"]);
});

test("upsertMessage: message older than the newest page goes to the older page", () => {
  const d = upsertMessage(twoPages(), msg("old", 2, { created_at: new Date(Date.UTC(2026, 8, 29, 10, 2, 30)).toISOString() }));
  assert.deepEqual(d.pages[1].messages.map((m) => m.id), ["a1", "a2", "old", "a3"]);
});

test("upsertMessage: twice is idempotent", () => {
  const once = upsertMessage(twoPages(), msg("n", 20));
  const twice = upsertMessage(once, msg("n", 20));
  assert.equal(ids(twice).filter((x) => x === "n").length, 1);
});

test("upsertMessage: empty cache gets a first page", () => {
  const d = upsertMessage({ pages: [], pageParams: [] }, msg("n", 1));
  assert.deepEqual(ids(d), ["n"]);
});

test("patchMessage: patches one message, untouched page keeps identity", () => {
  const base = twoPages();
  const d = patchMessage(base, "a2", (m) => ({ ...m, client_id: "p" }));
  assert.equal(d.pages[1].messages[1].client_id, "p");
  assert.equal(d.pages[0], base.pages[0]);
});

test("patchMessage: unknown id returns the same object", () => {
  const base = twoPages();
  assert.equal(patchMessage(base, "nope", (m) => m), base);
});

test("applyReaction: add by me sets userReacted and count", () => {
  const d = applyReaction(twoPages(), { messageId: "c1", type: "👍", userId: "me", userName: "Me", op: "add", meId: "me" });
  const r = d.pages[0].messages[0].reactions[0];
  assert.deepEqual(r, { type: "👍", count: 1, userReacted: true, users: ["Me"] });
});

test("applyReaction: repeated add is a no-op", () => {
  const once = applyReaction(twoPages(), { messageId: "c1", type: "👍", userId: "me", userName: "Me", op: "add", meId: "me" });
  const twice = applyReaction(once, { messageId: "c1", type: "👍", userId: "me", userName: "Me", op: "add", meId: "me" });
  assert.equal(twice, once);
});

test("applyReaction: other user's add leaves userReacted false; remove undoes", () => {
  const added = applyReaction(twoPages(), { messageId: "c1", type: "❤️", userId: "u2", userName: "Bo", op: "add", meId: "me" });
  const r = added.pages[0].messages[0].reactions[1];
  assert.deepEqual(r, { type: "❤️", count: 1, userReacted: false, users: ["Bo"] });
  const removed = applyReaction(added, { messageId: "c1", type: "❤️", userId: "u2", userName: "Bo", op: "remove", meId: "me" });
  assert.deepEqual(removed.pages[0].messages[0].reactions[1], { type: "❤️", count: 0, userReacted: false, users: [] });
});

test("patchPoll / findPollIdByOption", () => {
  const poll = { id: "p1", options: [{ id: "o1" }, { id: "o2" }] };
  const base = upsertMessage(twoPages(), msg("pm", 20, { poll_id: "p1", poll }));
  assert.equal(findPollIdByOption(base, "o2"), "p1");
  assert.equal(findPollIdByOption(base, "zz"), null);
  const next = patchPoll(base, "p1", { id: "p1", options: [{ id: "o1" }] });
  assert.equal(flatten(next).find((m) => m.id === "pm")!.poll!.options.length, 1);
  assert.equal(next.pages[1], base.pages[1]);
});

test("patchSmeter replaces the summary on referencing messages", () => {
  const base = upsertMessage(twoPages(), msg("sm", 20, { smeter_id: "s1", smeter: { v: 1 } }));
  const next = patchSmeter(base, "s1", { v: 2 });
  assert.deepEqual(flatten(next).find((m) => m.id === "sm")!.smeter, { v: 2 });
});

test("mergeLatest: keeps older pages, applies edits, adds new rows", () => {
  const fresh = { messages: [{ ...msg("c2", 11), client_id: "edited" }, msg("c4", 13)], hasMore: true };
  const d = mergeLatest(twoPages(), fresh);
  assert.deepEqual(ids(d), ["a1", "a2", "a3", "c1", "c2", "c3", "c4"]);
  assert.equal(flatten(d).find((m) => m.id === "c2")!.client_id, "edited");
  assert.equal(d.pages.length, 2);
});

test("mergeLatest: single page takes fresh hasMore; undefined cache becomes fresh", () => {
  const single = { pages: [{ messages: [msg("x", 1)], hasMore: false }], pageParams: [undefined] };
  assert.equal(mergeLatest(single, { messages: [msg("x", 1)], hasMore: true }).pages[0].hasMore, true);
  const fromNothing = mergeLatest(undefined, { messages: [msg("y", 1)], hasMore: false });
  assert.deepEqual(ids(fromNothing), ["y"]);
});

test("trimForPersist keeps only the newest page", () => {
  const t = trimForPersist(twoPages());
  assert.equal(t.pages.length, 1);
  assert.deepEqual(t.pageParams, [undefined]);
});

test("trimPersistedMessages trims only infinite messages.list queries", () => {
  const client = {
    clientState: {
      queries: [
        { queryKey: [["messages", "list"], { input: { threadId: "t" }, type: "infinite" }], state: { data: twoPages() as unknown } },
        { queryKey: [["threads", "list"], { input: { groupId: "g" }, type: "query" }], state: { data: [1, 2, 3] as unknown } },
      ],
    },
  };
  const out = trimPersistedMessages(client);
  assert.equal((out.clientState.queries[0].state.data as ThreadPages<CacheMessage>).pages.length, 1);
  assert.deepEqual(out.clientState.queries[1].state.data, [1, 2, 3]);
  assert.equal((client.clientState.queries[0].state.data as ThreadPages<CacheMessage>).pages.length, 2);
});

test("mergePending: hides pending rows already on the server, keeps the rest in order", () => {
  const server = [msg("s1", 1, { client_id: "k1" })];
  const pending = [
    msg("pending-k1", 2, { client_id: "k1", delivery_status: "sending" }),
    msg("pending-k2", 3, { client_id: "k2", delivery_status: "failed" }),
    msg("pending-k3", 4, { client_id: "k3", delivery_status: "sending" }),
  ];
  assert.deepEqual(mergePending(server, pending).map((m) => m.id), ["s1", "pending-k2", "pending-k3"]);
});

test("mergePending: no pending returns the server array", () => {
  const server = [msg("s1", 1)];
  assert.equal(mergePending(server, []), server);
});

test("nextToDispatch", () => {
  assert.equal(nextToDispatch([]), null);
  const a = { key: "a", status: "ready" as const };
  const b = { key: "b", status: "ready" as const };
  assert.equal(nextToDispatch([a, b]), a);
  assert.equal(nextToDispatch([{ key: "u", status: "uploading" as const }, b]), null);
  assert.equal(nextToDispatch([{ key: "d", status: "dispatching" as const }, b]), null);
  assert.equal(nextToDispatch([{ key: "f", status: "failed" as const }, b]), b);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMentionMatcher, mentionsUser, MENTION_SPECIALS } from "../lib/mentions.ts";

const members = [
  { id: "1", display_name: "Anna" },
  { id: "2", display_name: "Anna Lee" },
  { id: "3", display_name: "J.R. (Ops)" },
];

function matches(body: string) {
  const { regex } = buildMentionMatcher(members, MENTION_SPECIALS);
  assert.ok(regex);
  regex.lastIndex = 0;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) out.push(m[1]);
  return out;
}

test("buildMentionMatcher: longest name wins", () => {
  assert.deepEqual(matches("hi @Anna Lee and @Anna"), ["Anna Lee", "Anna"]);
});

test("buildMentionMatcher: regex characters in names are escaped", () => {
  assert.deepEqual(matches("ping @J.R. (Ops) now"), ["J.R. (Ops)"]);
  assert.deepEqual(matches("@JxR"), []);
});

test("buildMentionMatcher: specials match", () => {
  assert.deepEqual(matches("@everyone and @here"), ["everyone", "here"]);
});

test("buildMentionMatcher: byName lookup is case-insensitive", () => {
  const { byName } = buildMentionMatcher(members, MENTION_SPECIALS);
  assert.equal(byName.get("anna lee")?.id, "2");
  assert.equal(byName.get("ANNA".toLowerCase())?.id, "1");
});

test("buildMentionMatcher: nothing to match gives null regex", () => {
  assert.equal(buildMentionMatcher([], []).regex, null);
});

test("mentionsUser: name and specials", () => {
  assert.equal(mentionsUser("hey @Anna!", "Anna"), true);
  assert.equal(mentionsUser("hey @Annabel", "Anna"), false);
  assert.equal(mentionsUser("@here standup", "Bob"), true);
  assert.equal(mentionsUser("", "Bob"), false);
});

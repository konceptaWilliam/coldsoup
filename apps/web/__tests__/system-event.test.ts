import { test } from "node:test";
import assert from "node:assert/strict";
import { systemEventText } from "../lib/system-event.ts";

const base = { kind: "blob_evolved", userId: "u1", userName: "William", shape: "cloud" } as const;

test("blob_evolved text", () => {
  assert.equal(
    systemEventText({ ...base, level: 2, shiny: false }),
    "William reached Lv2 and unlocked cloud",
  );
});

test("blob_evolved shiny text", () => {
  assert.equal(
    systemEventText({ ...base, level: 3, shape: "sun", shiny: true }),
    "✨ William reached Lv3 and it's SHINY",
  );
});

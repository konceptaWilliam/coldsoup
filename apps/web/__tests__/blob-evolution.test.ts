import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVOLUTION,
  ODDS,
  POS,
  SHAPES,
  RARE_TIER,
  DEFAULT_BLOB,
  levelFor,
  formShape,
  formLook,
  blobTraits,
  rerollPool,
  pickWeighted,
  chance,
  rerollReady,
  rerollProgress,
  blobStateFromRow,
  hexHue,
  finishLayers,
  type Shape,
} from "../lib/blob-evolution.ts";

test("table covers every shape, never repeats within a row", () => {
  assert.equal(Object.keys(EVOLUTION).length, 10);
  for (const base of SHAPES) {
    const [l2, l3] = EVOLUTION[base];
    assert.notEqual(l2, base, base);
    assert.notEqual(l3, base, base);
    assert.notEqual(l2, l3, base);
  }
});

test("Lv3 is rarer than Lv1, except triangle (already rarest)", () => {
  for (const base of SHAPES) {
    if (base === "triangle") continue;
    assert.ok(ODDS[EVOLUTION[base][1]] < ODDS[base], base);
  }
});

test("POS midpoints are inside [0, 1)", () => {
  for (const s of SHAPES) assert.ok(POS[s] >= 0 && POS[s] < 1, s);
});

test("levelFor boundaries", () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(49), 1);
  assert.equal(levelFor(50), 2);
  assert.equal(levelFor(499), 2);
  assert.equal(levelFor(500), 3);
  assert.equal(levelFor(9000), 3);
});

test("formShape uses the table, lv3Shape overrides Lv3 only", () => {
  assert.equal(formShape("round", 1, null), "round");
  assert.equal(formShape("round", 2, null), "cloud");
  assert.equal(formShape("round", 3, null), "sun");
  assert.equal(formShape("round", 3, "triangle"), "triangle");
  assert.equal(formShape("round", 2, "triangle"), "cloud");
});

test("formLook: Lv1 is unpinned plain; Lv2 plain or shiny; Lv3 holo or shiny", () => {
  const s = { shiny2: false, shiny3: false, lv3Shape: null };
  assert.deepEqual(formLook("round", 1, { ...s, shiny2: true, shiny3: true }), { shape: null, finish: "plain" });
  assert.deepEqual(formLook("round", 2, s), { shape: "cloud", finish: "plain" });
  assert.deepEqual(formLook("round", 2, { ...s, shiny2: true }), { shape: "cloud", finish: "shiny" });
  assert.deepEqual(formLook("round", 3, s), { shape: "sun", finish: "holo" });
  assert.deepEqual(formLook("round", 3, { ...s, shiny3: true, lv3Shape: "triangle" }), { shape: "triangle", finish: "shiny" });
});

test("blobTraits: unpinned Lv1 passes nothing (byte-identical to today)", () => {
  assert.equal(blobTraits(null), undefined);
  assert.deepEqual(blobTraits("sun"), { shape: POS.sun });
});

test("rerollPool: rare tier, rarer than base, excludes own line", () => {
  // round (22%): rarer rare-tier minus cloud (Lv2) and sun (current Lv3)
  assert.deepEqual(rerollPool("round", "cloud", "sun"), ["droplet", "hexagon", "triangle"]);
  // droplet: only sun left that is rarer and not in the line
  assert.deepEqual(rerollPool("droplet", "hexagon", "triangle"), ["sun"]);
});

test("rerollPool falls back to the rare tier when nothing rarer is left", () => {
  // hexagon: rarer = sun, triangle — both in the line → fallback
  assert.deepEqual(rerollPool("hexagon", "sun", "triangle"), ["cloud", "droplet"]);
  assert.deepEqual(rerollPool("triangle", "hexagon", "sun"), ["cloud", "droplet"]);
});

test("rerollPool is never empty and never contains the line", () => {
  for (const base of SHAPES) {
    const [l2, l3] = EVOLUTION[base];
    for (const cur of [l3, ...RARE_TIER]) {
      if (cur === base || cur === l2) continue;
      const pool = rerollPool(base, l2, cur);
      assert.ok(pool.length > 0, `${base}/${cur}`);
      for (const s of pool) assert.ok(s !== base && s !== l2 && s !== cur, `${base}/${cur}/${s}`);
    }
  }
});

test("pickWeighted walks cumulative weights (odds × 10)", () => {
  const pool: Shape[] = ["droplet", "hexagon", "triangle"]; // weights 55, 35, 20 → total 110
  assert.equal(pickWeighted(pool, () => 0), "droplet");
  assert.equal(pickWeighted(pool, () => 54), "droplet");
  assert.equal(pickWeighted(pool, () => 55), "hexagon");
  assert.equal(pickWeighted(pool, () => 89), "hexagon");
  assert.equal(pickWeighted(pool, () => 90), "triangle");
  assert.equal(pickWeighted(pool, () => 109), "triangle");
  let seen = 0;
  pickWeighted(pool, (n) => { seen = n; return 0; });
  assert.equal(seen, 110);
});

test("chance(n) hits only on 0", () => {
  assert.equal(chance(4, () => 0), true);
  assert.equal(chance(4, () => 3), false);
  let seen = 0;
  chance(16, (n) => { seen = n; return 1; });
  assert.equal(seen, 16);
});

test("rerollReady needs Lv3, no shiny, 200 XP since last roll", () => {
  const base = { level: 3 as const, shiny3: false, xp: 700, rerollXp: 500 };
  assert.equal(rerollReady(base), true);
  assert.equal(rerollReady({ ...base, xp: 699 }), false);
  assert.equal(rerollReady({ ...base, shiny3: true }), false);
  assert.equal(rerollReady({ ...base, level: 2 }), false);
});

test("rerollProgress clamps to [0, 200] — charges never stack", () => {
  assert.equal(rerollProgress(500, 500), 0);
  assert.equal(rerollProgress(643, 500), 143);
  assert.equal(rerollProgress(5000, 500), 200);
});

test("blobStateFromRow maps columns and rejects bad values", () => {
  assert.deepEqual(
    blobStateFromRow({ blob_level: 3, blob_form: 2, blob_shiny2: true, blob_shiny3: true, blob_lv3_shape: "sun" }),
    { level: 3, form: 2, shiny2: true, shiny3: true, lv3Shape: "sun" },
  );
  assert.deepEqual(
    blobStateFromRow({ blob_level: 7, blob_form: 9, blob_shiny2: null, blob_shiny3: null, blob_lv3_shape: "blob" }),
    DEFAULT_BLOB,
  );
  // form can never exceed level
  assert.equal(blobStateFromRow({ blob_level: 2, blob_form: 3 }).form, 1);
});

test("hexHue", () => {
  assert.equal(hexHue("#ff0000"), 0);
  assert.equal(hexHue("#00ff00"), 120);
  assert.equal(hexHue("#0000ff"), 240);
  assert.equal(hexHue("#808080"), 0);
});

test("finishLayers: hue offsets per finish", () => {
  assert.deepEqual(finishLayers("plain"), []);
  assert.deepEqual(finishLayers("holo"), [100]);
  assert.deepEqual(finishLayers("shiny"), [120, 240]);
});

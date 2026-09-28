import { test } from "node:test";
import assert from "node:assert/strict";
import { aimVector, eyeVars, easeToward, type Face } from "../lib/gaze-field.ts";

const FACE: Face = {
  marks: [
    { x: -0.35, y: -0.1 },
    { x: 0.35, y: -0.1 },
  ],
  rx: 30,
  ry: 28,
};

const num = (vars: Record<string, string>, key: string) => Number(vars[key]);

test("aimVector is a unit vector toward the target", () => {
  const a = aimVector({ x: 0, y: 0 }, { x: 30, y: 40 });
  assert.ok(Math.abs(a.x - 0.6) < 1e-9 && Math.abs(a.y - 0.8) < 1e-9);
});

test("aimVector at the same point is zero, not NaN", () => {
  assert.deepEqual(aimVector({ x: 5, y: 5 }, { x: 5, y: 5 }), { x: 0, y: 0 });
});

test("eyeVars writes 5 channels per eye", () => {
  const vars = eyeVars(FACE, { x: 0, y: 1 }, 1, 7);
  assert.equal(Object.keys(vars).length, 10);
  for (const n of [1, 2])
    for (const k of ["dx", "dy", "sx", "sy", "t"])
      assert.ok(`--mo-gz-${k}${n}` in vars, `missing --mo-gz-${k}${n}`);
});

test("amount 0 is the neutral pose", () => {
  const vars = eyeVars(FACE, { x: 0, y: 1 }, 0, 7);
  for (const n of [1, 2]) {
    assert.equal(num(vars, `--mo-gz-dx${n}`), 0);
    assert.equal(num(vars, `--mo-gz-dy${n}`), 0);
    assert.equal(num(vars, `--mo-gz-t${n}`), 0);
    assert.equal(num(vars, `--mo-gz-sx${n}`), 1);
    assert.equal(num(vars, `--mo-gz-sy${n}`), 1);
  }
});

test("looking down moves both eyes down", () => {
  const vars = eyeVars(FACE, { x: 0, y: 1 }, 1, 7);
  assert.ok(num(vars, "--mo-gz-dy1") > 0);
  assert.ok(num(vars, "--mo-gz-dy2") > 0);
});

test("more travel looks further", () => {
  const near = eyeVars(FACE, { x: 0, y: 1 }, 1, 3);
  const far = eyeVars(FACE, { x: 0, y: 1 }, 1, 9);
  assert.ok(num(far, "--mo-gz-dy1") > num(near, "--mo-gz-dy1"));
});

test("easeToward converges and snaps at the end", () => {
  let v = 0;
  for (let i = 0; i < 200; i++) v = easeToward(v, 1, 16);
  assert.equal(v, 1);
  assert.ok(easeToward(0, 1, 16) > 0 && easeToward(0, 1, 16) < 1);
  assert.equal(easeToward(1, 0, 10_000), 0);
});

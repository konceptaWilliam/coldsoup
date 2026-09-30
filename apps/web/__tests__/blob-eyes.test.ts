import { test } from "node:test";
import assert from "node:assert/strict";
import { blobatar, _layout } from "blobatar";
import { _parts } from "blobatar/internal";
import { happy, sleepy } from "blobatar/expression";
import {
  contrast,
  eyeHue,
  gemEye,
  glintFill,
  lightInk,
  withGlints,
} from "../lib/blob-eyes.ts";
import { POS, hexHue } from "../lib/blob-evolution.ts";

const UUID = "11111111-2222-3333-4444-555555555555";
const SEEDS = Array.from({ length: 60 }, (_, i) => `${i.toString(16).padStart(8, "0")}-2222-3333-4444-555555555555`);
const circles = (s: string) => (s.match(/<circle [^>]*fill="#(?:ffffff|1a1a1a)"/g) ?? []).length;

test("eye colour is a pure function of the seed", () => {
  const { head, eye } = _layout(UUID).palette;
  // Frozen: this value changing means every Lv2+ blob just changed colour.
  assert.equal(gemEye(UUID, head!, eye!), "#8e230b");
});

test("eye colour does not depend on the shape, so Lv2, Lv3 and rerolls agree", () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const eyes = new Set(
      Object.values(POS).map((shape) => {
        const p = _layout(seed, { traits: { shape } }).palette;
        return gemEye(seed, p.head!, p.eye!);
      }),
    );
    assert.equal(eyes.size, 1, seed);
  }
});

test("eye hue keeps its distance from the body hue", () => {
  for (const seed of SEEDS) {
    const body = hexHue(_layout(seed).palette.head!);
    const gap = Math.abs(((eyeHue(seed, body) - body + 540) % 360) - 180);
    assert.ok(gap >= 50, `${seed}: gap ${gap}`);
  }
});

test("eyes keep blobatar's ink polarity and clear the contrast floor", () => {
  for (const seed of SEEDS) {
    const { head, eye } = _layout(seed).palette;
    const gem = gemEye(seed, head!, eye!);
    assert.equal(lightInk(head!, gem), lightInk(head!, eye!), seed);
    assert.ok(contrast(gem, head!) >= 3, `${seed}: ${contrast(gem, head!)}`);
  }
});

test("glints stay visible on the eye", () => {
  for (const seed of SEEDS) {
    const { head, eye } = _layout(seed).palette;
    const gem = gemEye(seed, head!, eye!);
    assert.ok(contrast(gem, glintFill(gem)) >= 1.8, seed);
  }
});

test("static markup: two glints per eye, inside the eye group", () => {
  for (const shape of Object.values(POS)) {
    const traits = { shape };
    const palette = { eye: "#123456" };
    const svg = blobatar(UUID, { traits, palette, background: false });
    const out = withGlints(svg, _layout(UUID, { traits, palette }).eyes, "#ffffff", false);
    assert.equal(circles(out), 4, `shape ${shape}`);
    assert.match(out, /<g fill="#123456">(?:<path d="[^"]*"\/><circle[^>]*\/><circle[^>]*\/>){2}<\/g>/);
  }
});

test("static markup with a baked pose still gets glints", () => {
  const traits = { shape: POS.cloud };
  const svg = blobatar(UUID, { traits, background: false, expression: sleepy });
  const eyes = _layout(UUID, { traits, expression: sleepy }).eyes;
  assert.equal(circles(withGlints(svg, eyes, "#ffffff", false)), 4);
});

test("animated markup: path and glints share one child of each .mo-eye", () => {
  const traits = { shape: POS.cloud };
  const inner = _parts(UUID, { traits, background: false, animate: "always" }).inner;
  const out = withGlints(inner, _layout(UUID, { traits }).eyes, "#ffffff", true);
  const eyes = out.match(/<g class="mo-eye"[^>]*><g><path d="[^"]*"\/><circle[^>]*\/><circle[^>]*\/><\/g><\/g>/g);
  assert.equal(eyes?.length, 2);
});

test("animated markup does not vary with the expression", () => {
  const traits = { shape: POS.cloud };
  const eyes = _layout(UUID, { traits }).eyes;
  const a = _parts(UUID, { traits, animate: "always" }).inner;
  const b = _parts(UUID, { traits, animate: "always", expression: happy }).inner;
  assert.equal(withGlints(a, eyes, "#fff", true), withGlints(b, eyes, "#fff", true));
});

test("unrecognised markup is returned untouched", () => {
  const eyes = _layout(UUID).eyes;
  assert.equal(withGlints("<svg></svg>", eyes, "#fff", false), "<svg></svg>");
  assert.equal(withGlints("<g></g>", eyes, "#fff", true), "<g></g>");
  const svg = blobatar(UUID, { background: false });
  assert.equal(withGlints(svg, eyes.slice(0, 1), "#fff", false), svg);
});

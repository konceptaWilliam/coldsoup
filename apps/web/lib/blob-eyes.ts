// Lv2+ eyes: a colour and catchlights, both pure functions of the user id, so
// nothing is stored, Lv3 inherits them and a Lv3 reroll can't touch them.
// No React / blobatar imports, so it runs under `node --test` like
// blob-evolution.ts.
//
// Frozen once shipped: changing the hash, the hue rule or the tones re-colours
// every Lv2+ blob in the app.

import { hexHue } from "./blob-evolution.ts";

/** One eye as `_layout(...).eyes` reports it (viewBox units, rot in degrees). */
export type EyeGeom = { cx: number; cy: number; rx: number; ry: number; rot: number };

/** Eye hues closer than this to the body hue get flipped to the far side. */
const MIN_HUE_GAP = 50;
const SAT = 85;
/** Starting lightness for dark-ink / light-ink eyes (HSL %). */
const DARK_L = 30;
const LIGHT_L = 70;
/** WCAG non-text contrast floor between eye and body. */
const MIN_CONTRAST = 3;
/** Below this the glints are sub-pixel smudge; draw the colour only. */
export const MIN_GLINT_SIZE = 32;

/** FNV-1a, 32-bit. Tiny, stable, and not the hash blobatar uses for traits. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

function hslHex(h: number, s: number, l: number): string {
  const sl = s / 100;
  const ll = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, "0")).join("");
}

/** The user's eye hue: hashed, then kept at least MIN_HUE_GAP from the body. */
export function eyeHue(seed: string, bodyHue: number): number {
  const h = fnv1a(`${seed}:eyes`) % 360;
  const gap = Math.abs(((h - bodyHue + 540) % 360) - 180);
  return gap < MIN_HUE_GAP ? (h + 180) % 360 : h;
}

/** Whether blobatar drew this blob's eyes lighter than its body. */
export function lightInk(head: string, eye: string): boolean {
  return luminance(eye) > luminance(head);
}

/**
 * The Lv2+ eye colour for a seed, given the blob's default head and eye.
 * Keeps blobatar's ink polarity (dark eyes stay dark, light stay light) and
 * walks lightness away from the body until the pair clears MIN_CONTRAST.
 */
export function gemEye(seed: string, head: string, eye: string): string {
  const light = lightInk(head, eye);
  const h = eyeHue(seed, hexHue(head));
  let l = light ? LIGHT_L : DARK_L;
  let hex = hslHex(h, SAT, l);
  while (contrast(hex, head) < MIN_CONTRAST && l > 4 && l < 96) {
    l += light ? 2 : -2;
    hex = hslHex(h, SAT, l);
  }
  return hex;
}

/** Glint fill: white, unless the eye itself is too pale for white to show. */
export function glintFill(eye: string): string {
  return contrast(eye, "#ffffff") >= 1.8 ? "#ffffff" : "#1a1a1a";
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function turn(x: number, y: number, e: EyeGeom): [number, number] {
  const t = (e.rot * Math.PI) / 180;
  return [e.cx + x * Math.cos(t) - y * Math.sin(t), e.cy + x * Math.sin(t) + y * Math.cos(t)];
}

/** A big glint up-right and a small one low-left, in the eye's own frame. */
export function glintMarkup(e: EyeGeom, fill: string): string {
  const r = Math.min(e.rx * 0.4, 1.2);
  const [x1, y1] = turn(e.rx * 0.22, -e.ry * 0.52, e);
  const [x2, y2] = turn(-e.rx * 0.2, e.ry * 0.5, e);
  return (
    `<circle cx="${r2(x1)}" cy="${r2(y1)}" r="${r2(r)}" fill="${fill}"/>` +
    `<circle cx="${r2(x2)}" cy="${r2(y2)}" r="${r2(r * 0.4)}" fill="${fill}" fill-opacity="0.7"/>`
  );
}

const STATIC_EYES = /<g fill="[^"]*">((?:<path d="[^"]*"\/>)+)<\/g>/g;
const ANIMATED_EYE = /(<g class="mo-eye"[^>]*>)(<path d="[^"]*"\/>)(<\/g>)/g;

/**
 * Adds catchlights to blobatar markup. Returns the markup unchanged if it
 * doesn't find exactly one eye per entry in `eyes`, so a lib change degrades
 * to plain eyes rather than to broken ones.
 *
 * Animated markup (`_parts().inner`): each `.mo-eye` holds one shape, and
 * motion.css blinks `.mo-eye > *` about that child's own fill-box. The eye path
 * and its glints go into one wrapper <g> so they blink, gaze and pose as a unit
 * about the eye's centre (glints sit inside the eye, so the box is unchanged).
 *
 * Static markup (`blobatar()`): the eyes are the last `<g fill>` group; the
 * glints go right after each eye path, inside any pose wrap.
 */
export function withGlints(markup: string, eyes: EyeGeom[], fill: string, animated: boolean): string {
  if (animated) {
    let i = 0;
    const out = markup.replace(ANIMATED_EYE, (_m, open: string, path: string, close: string) => {
      const e = eyes[i++];
      return e ? `${open}<g>${path}${glintMarkup(e, fill)}</g>${close}` : _m;
    });
    return i === eyes.length ? out : markup;
  }
  const groups = Array.from(markup.matchAll(STATIC_EYES));
  const last = groups[groups.length - 1];
  if (!last || last.index === undefined) return markup;
  const paths = last[1].match(/<path d="[^"]*"\/>/g) ?? [];
  if (paths.length !== eyes.length) return markup;
  const inner = paths.map((p, i) => p + glintMarkup(eyes[i], fill)).join("");
  const start = last.index + last[0].indexOf(last[1]);
  return markup.slice(0, start) + inner + markup.slice(start + last[1].length);
}

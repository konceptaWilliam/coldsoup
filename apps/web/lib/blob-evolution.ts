// Pure blobatar evolution rules. No React / blobatar imports, so it runs under
// `node --test --experimental-strip-types` and on the server alike.
//
// Lv1 is the blobatar every user already had: rendered with no traits, so it
// is byte-identical to the pre-evolution avatar. Lv2 / Lv3 pin `traits.shape`
// only, so hue, eyes and every other trait stay seeded from the user id.

export type Shape =
  | "round" | "organic" | "boxy" | "capsule" | "nub"
  | "cloud" | "droplet" | "hexagon" | "sun" | "triangle";
export type Form = 1 | 2 | 3;
export type Finish = "plain" | "holo" | "shiny";

export const LV2_XP = 50;
export const LV3_XP = 150;
export const REROLL_EVERY = 200;
export const SHINY2_ODDS = 16;
export const SHINY3_ODDS = 4;

/** Midpoint of each silhouette's band in blobatar gen2 (src/styles/blob.ts). */
export const POS: Record<Shape, number> = {
  round: 0.11, organic: 0.35, boxy: 0.54, capsule: 0.65, nub: 0.745,
  cloud: 0.825, droplet: 0.8875, hexagon: 0.9325, sun: 0.965, triangle: 0.99,
};

/** Native gen2 odds in percent, common → rare. */
export const ODDS: Record<Shape, number> = {
  organic: 26, round: 22, boxy: 12, capsule: 10, nub: 9,
  cloud: 7, droplet: 5.5, hexagon: 3.5, sun: 3, triangle: 2,
};

export const SHAPES = Object.keys(ODDS) as Shape[];
export const RARE_TIER: Shape[] = ["cloud", "droplet", "hexagon", "sun", "triangle"];

/** Lv1 shape → [Lv2, Lv3]. Lv3 is rarer than Lv1 except for triangle. */
export const EVOLUTION: Record<Shape, [Shape, Shape]> = {
  organic: ["nub", "droplet"],
  round: ["cloud", "sun"],
  boxy: ["capsule", "hexagon"],
  capsule: ["droplet", "hexagon"],
  nub: ["cloud", "sun"],
  cloud: ["droplet", "triangle"],
  droplet: ["hexagon", "triangle"],
  hexagon: ["sun", "triangle"],
  sun: ["hexagon", "triangle"],
  triangle: ["hexagon", "sun"],
};

export type BlobState = {
  level: Form;
  form: Form;
  shiny2: boolean;
  shiny3: boolean;
  lv3Shape: Shape | null;
};

export const DEFAULT_BLOB: BlobState = { level: 1, form: 1, shiny2: false, shiny3: false, lv3Shape: null };

export type FormLook = { shape: Shape | null; finish: Finish };

/** rand(n) returns an integer in [0, n). */
export type RandInt = (n: number) => number;

export function isShape(s: unknown): s is Shape {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(POS, s);
}

const isForm = (n: unknown): n is Form => n === 1 || n === 2 || n === 3;

export function levelFor(xp: number): Form {
  return xp >= LV3_XP ? 3 : xp >= LV2_XP ? 2 : 1;
}

export function formShape(base: Shape, form: Form, lv3Shape: Shape | null): Shape {
  if (form === 1) return base;
  if (form === 2) return EVOLUTION[base][0];
  return lv3Shape ?? EVOLUTION[base][1];
}

/** What to draw for a form. `shape: null` = unpinned Lv1 (today's blob). */
export function formLook(
  base: Shape,
  form: Form,
  s: Pick<BlobState, "shiny2" | "shiny3" | "lv3Shape">,
): FormLook {
  if (form === 1) return { shape: null, finish: "plain" };
  if (form === 2) return { shape: EVOLUTION[base][0], finish: s.shiny2 ? "shiny" : "plain" };
  return { shape: s.lv3Shape ?? EVOLUTION[base][1], finish: s.shiny3 ? "shiny" : "holo" };
}

/** `traits` prop for <Blobatar>. Undefined for Lv1 so nothing about it changes. */
export function blobTraits(shape: Shape | null): { shape: number } | undefined {
  return shape ? { shape: POS[shape] } : undefined;
}

/**
 * Candidate Lv3 shapes for a reroll: rare-tier shapes rarer than the Lv1
 * shape, minus the user's Lv1, Lv2 and current Lv3. If nothing rarer is left,
 * fall back to the rare tier minus those three.
 */
export function rerollPool(base: Shape, lv2: Shape, cur: Shape): Shape[] {
  const keep = (s: Shape) => s !== base && s !== lv2 && s !== cur;
  const rarer = RARE_TIER.filter((s) => ODDS[s] < ODDS[base] && keep(s));
  return rarer.length ? rarer : RARE_TIER.filter(keep);
}

/** Weighted by native odds (×10 to keep integer weights for 5.5 / 3.5). */
export function pickWeighted(pool: Shape[], rand: RandInt): Shape {
  const weights = pool.map((s) => Math.round(ODDS[s] * 10));
  let r = rand(weights.reduce((a, b) => a + b, 0));
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** True with probability 1 / odds. */
export function chance(odds: number, rand: RandInt): boolean {
  return rand(odds) === 0;
}

export function rerollReady(s: { level: number; shiny3: boolean; xp: number; rerollXp: number }): boolean {
  return s.level === 3 && !s.shiny3 && s.xp - s.rerollXp >= REROLL_EVERY;
}

/** Messages toward the next charge, capped: charges don't stack. */
export function rerollProgress(xp: number, rerollXp: number): number {
  return Math.min(REROLL_EVERY, Math.max(0, xp - rerollXp));
}

/** Map a `profiles` row to BlobState, falling back to Lv1 on anything odd. */
export function blobStateFromRow(r: Record<string, unknown>): BlobState {
  const level = isForm(r.blob_level) ? r.blob_level : 1;
  const form = isForm(r.blob_form) && r.blob_form <= level ? r.blob_form : 1;
  return {
    level,
    form,
    shiny2: r.blob_shiny2 === true,
    shiny3: r.blob_shiny3 === true,
    lv3Shape: isShape(r.blob_lv3_shape) ? r.blob_lv3_shape : null,
  };
}

/** HSL hue of a #rrggbb colour, 0 for greys. Close enough to offset from. */
export function hexHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

/** Hue offsets (degrees) of the extra layers a finish stacks on the base. */
export function finishLayers(finish: Finish): number[] {
  if (finish === "holo") return [100];
  if (finish === "shiny") return [120, 240];
  return [];
}

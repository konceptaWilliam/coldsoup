// A "field" gaze driver: aims every visible blobatar under a root element at
// one target element (the composer).
//
// blobatar's own `gaze()` only attaches with a fine hover pointer, so it never
// runs on phones. Its source anticipates this case ("a host driving a field
// computes its own ... and writes the channel itself"), and exports the
// geometry it uses. We reuse that `survey()`/`project()` math and write the
// same `--mo-gz-*` / `--mo-track-hold` channels that `blobatar/gaze.css`
// reads, so the look matches the library's gaze exactly. The channel names
// are why blobatar is pinned to an exact version.

import { project, survey } from "blobatar/gaze";

export type Point = { x: number; y: number };
export type Face = { marks: Point[]; rx: number; ry: number };

/** Excursion in viewBox units (the face is 100 across); ~2px at 28px. */
export const GAZE_TRAVEL = 7;
/** Time constant for easing the look in and out. */
const TAU_MS = 80;
const SNAP = 0.01;

const CHANNELS = ["dx", "dy", "sx", "sy", "t"] as const;

export function aimVector(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  return d > 0 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
}

/** The `--mo-gz-*` values that turn a face's eyes toward `aim`. */
export function eyeVars(
  face: Face,
  aim: Point,
  amount: number,
  travel: number,
): Record<string, string> {
  const yaw = (travel / face.rx) * aim.x * amount;
  const pitch = (travel / face.ry) * aim.y * amount;
  const vars: Record<string, string> = {};
  face.marks.forEach((mark, i) => {
    const p = project(mark, yaw, pitch);
    const n = i + 1;
    vars[`--mo-gz-dx${n}`] = (p.dx * face.rx).toFixed(3);
    vars[`--mo-gz-dy${n}`] = (p.dy * face.ry).toFixed(3);
    vars[`--mo-gz-sx${n}`] = p.sx.toFixed(4);
    vars[`--mo-gz-sy${n}`] = p.sy.toFixed(4);
    vars[`--mo-gz-t${n}`] = p.t.toFixed(3);
  });
  return vars;
}

/** Frame-rate independent exponential ease, snapping when close. */
export function easeToward(current: number, target: number, dtMs: number): number {
  const next = current + (target - current) * (1 - Math.exp(-dtMs / TAU_MS));
  return Math.abs(target - next) < SNAP ? target : next;
}

export type GazeField = {
  /** Start (true) or stop (false) looking at the target. */
  setActive: (on: boolean) => void;
  /** Re-aim after scroll / new messages while looking. */
  refresh: () => void;
  stop: () => void;
};

export function createGazeField(
  root: HTMLElement,
  target: HTMLElement,
  travel = GAZE_TRAVEL,
): GazeField {
  const faces = new WeakMap<SVGSVGElement, Face | null>();
  const touched = new Set<SVGSVGElement>();
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  let amount = 0;
  let goal = 0;
  let raf = 0;
  let last = 0;

  const visibleBlobs = () => {
    const vh = window.innerHeight;
    return Array.from(root.querySelectorAll<SVGSVGElement>("svg")).filter((svg) => {
      if (!svg.querySelector(".mo-eyes")) return false;
      const r = svg.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < vh;
    });
  };

  const paint = () => {
    const t = target.getBoundingClientRect();
    const to = { x: t.left + t.width / 2, y: t.top + t.height / 2 };
    for (const svg of visibleBlobs()) {
      let face = faces.get(svg);
      if (face === undefined) {
        face = survey(svg);
        faces.set(svg, face);
      }
      const eyes = svg.querySelector<SVGElement>(".mo-eyes");
      if (!face || !eyes) continue;
      const r = svg.getBoundingClientRect();
      const aim = aimVector({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, to);
      for (const [k, v] of Object.entries(eyeVars(face, aim, amount, travel))) {
        eyes.style.setProperty(k, v);
      }
      // Stand the idle glance down while we hold the eyes (see gaze.css).
      svg.style.setProperty("--mo-track-hold", amount.toFixed(3));
      touched.add(svg);
    }
  };

  const clear = () => {
    touched.forEach((svg) => {
      const eyes = svg.querySelector<SVGElement>(".mo-eyes");
      for (let n = 1; n <= 2; n++)
        for (const k of CHANNELS) eyes?.style.removeProperty(`--mo-gz-${k}${n}`);
      svg.style.removeProperty("--mo-track-hold");
    });
    touched.clear();
  };

  const frame = (now: number) => {
    raf = 0;
    const dt = last ? Math.min(now - last, 64) : 16;
    last = now;
    amount = easeToward(amount, goal, dt);
    if (amount === 0 && goal === 0) {
      clear();
      last = 0;
      return;
    }
    paint();
    if (amount !== goal) raf = requestAnimationFrame(frame);
    else last = 0;
  };

  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  return {
    setActive(on) {
      const next = on && !still.matches ? 1 : 0;
      if (next === goal) return;
      goal = next;
      kick();
    },
    refresh() {
      if (amount > 0) kick();
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      amount = goal = 0;
      clear();
    },
  };
}

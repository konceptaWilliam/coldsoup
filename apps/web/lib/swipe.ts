// Interactive swipe-back (mobile thread pane → thread list).

/** A back-swipe only starts this close to the left screen edge. */
export const SWIPE_EDGE_PX = 24;
/** Movement before the gesture decides horizontal vs vertical. */
export const SWIPE_LOCK_PX = 8;

const COMMIT_FRACTION = 0.35;
const FLICK_VELOCITY = 0.5; // px/ms
const FLICK_MIN_DX = 40;

export function shouldCommitSwipe({
  dx,
  width,
  velocity,
}: {
  dx: number;
  width: number;
  velocity: number;
}): boolean {
  if (dx <= 0) return false;
  if (dx > COMMIT_FRACTION * width) return true;
  return velocity > FLICK_VELOCITY && dx >= FLICK_MIN_DX;
}

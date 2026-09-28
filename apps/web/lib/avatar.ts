// Pure mapping from a user to <Blobatar> props. No React / blobatar imports
// so it runs under `node --test --experimental-strip-types`.

export type BlobatarAnimate = "hover" | "always";

export type ResolvedBlobatar = {
  name: string;
  palette?: { head: string; eye: string };
  animate?: BlobatarAnimate;
};

/** Seed for users we can't identify (deleted accounts, @everyone/@here). */
export const NEUTRAL_SEED = "coldsoup:unknown";
/** Grey override so unknown users never look like a real person's blob. */
export const NEUTRAL_PALETTE = { head: "#d4d4d4", eye: "#404040" };
/** Below this the idle motion is sub-pixel; stay a cheap static <img>. */
export const MIN_ANIMATED_SIZE = 20;

export function resolveBlobatar({
  userId,
  size,
  animate,
}: {
  userId: string | null | undefined;
  size: number;
  animate?: BlobatarAnimate;
}): ResolvedBlobatar {
  const id = userId?.trim();
  const base: ResolvedBlobatar = id
    ? { name: id }
    : { name: NEUTRAL_SEED, palette: NEUTRAL_PALETTE };
  if (animate && size >= MIN_ANIMATED_SIZE) base.animate = animate;
  return base;
}

"use client";

import { forwardRef, useMemo } from "react";
import { Blobatar } from "@blobatar/react";
import { _layout, type Expression } from "blobatar";
import { blobatarUri } from "blobatar/uri";
import { blobTraits, finishLayers, hexHue, type FormLook } from "@/lib/blob-evolution";
import { MIN_GLINT_SIZE, gemEye } from "@/lib/blob-eyes";
import type { BlobatarAnimate } from "@/lib/avatar";
import { GlintBlobatar } from "@/components/glint-blobatar";

/** Locked forms in Settings / the profile card: body and eyes one grey. */
export const SILHOUETTE = { head: "#9A988F", eye: "#9A988F" };
/**
 * Locked forms draw this fixed seed + shape instead of the user's own, so the
 * silhouette is identical for everyone and never hints at the real evolution.
 * "round" is never an evolution target, so it can't match a real form either.
 */
const SILHOUETTE_SEED = "coldsoup:locked";
const SILHOUETTE_TRAITS = blobTraits("round");
/** Below this a finish is sub-pixel noise; draw the shape only. */
export const MIN_FINISH_SIZE = 20;
/** Shiny sparkles only where there is room for them. */
export const MIN_SPARKLE_SIZE = 56;

type Props = {
  /** Resolved blobatar seed (user id, or the neutral seed). */
  name: string;
  look: FormLook;
  size: number;
  animate?: BlobatarAnimate;
  expression?: Expression;
  palette?: { head: string; eye: string };
  silhouette?: boolean;
  title?: string;
};

// One form of a user's blob. The base layer is a normal <Blobatar>; a finish
// stacks hue-shifted copies (same traits, so identical geometry) under
// diagonal masks, plus a sheen masked to the blob's own silhouette.
// Lv2+ (a pinned shape) also gets the seed's gem eyes: a pinned eye colour on
// every layer, plus catchlights where there is room for them.
export const BlobForm = forwardRef<HTMLSpanElement, Props>(function BlobForm(
  { name, look, size, animate, expression, palette, silhouette, title },
  ref,
) {
  const traits = silhouette ? SILHOUETTE_TRAITS : blobTraits(look.shape);
  // Neutral blobs (explicit palette) and locked silhouettes keep plain eyes.
  const gem = !silhouette && !palette && look.shape !== null;
  const eyePalette = useMemo(() => {
    if (!gem) return undefined;
    const base = _layout(name).palette;
    return { eye: gemEye(name, base.head ?? "#888888", base.eye ?? "#000000") };
  }, [gem, name]);
  const common = {
    name: silhouette ? SILHOUETTE_SEED : name,
    traits,
    palette: silhouette ? SILHOUETTE : palette,
    expression,
    size,
    background: false as const,
  };
  const layer = (hue?: number, label?: string) =>
    eyePalette ? (
      <GlintBlobatar
        {...common}
        palette={eyePalette}
        hue={hue}
        animate={animate}
        title={label}
        alt={label ?? ""}
        glints={size >= MIN_GLINT_SIZE}
      />
    ) : animate ? (
      <Blobatar {...common} hue={hue} animate={animate} title={label} />
    ) : (
      <Blobatar {...common} hue={hue} title={label} alt={label ?? ""} />
    );

  const offsets = silhouette || size < MIN_FINISH_SIZE ? [] : finishLayers(look.finish);
  if (!offsets.length) {
    return (
      <span ref={ref} className="block leading-none" style={{ width: size, height: size }}>
        {layer(undefined, title)}
      </span>
    );
  }

  const head = _layout(name, { traits, palette }).palette.head ?? "#888888";
  const h = hexHue(head);
  const shiny = look.finish === "shiny";
  const mask = `url("${blobatarUri(name, { traits, palette, background: false })}")`;

  return (
    <span
      ref={ref}
      className={`blob-fx${shiny ? " blob-fx-shiny" : ""}${animate === "always" ? " blob-fx-big" : ""}`}
      style={{ width: size, height: size }}
    >
      {layer(undefined, title)}
      {offsets.map((o, i) => (
        <span key={o} className={`blob-fx-layer blob-fx-l${i + 2}`} aria-hidden>
          {layer((h + o) % 360)}
        </span>
      ))}
      <span className="blob-fx-sheen" aria-hidden style={{ ["--blob-mask" as string]: mask }} />
      {shiny && size >= MIN_SPARKLE_SIZE && (
        <>
          <span className="blob-fx-spark" aria-hidden>✦</span>
          <span className="blob-fx-spark" aria-hidden>✦</span>
          <span className="blob-fx-spark" aria-hidden>✦</span>
        </>
      )}
    </span>
  );
});

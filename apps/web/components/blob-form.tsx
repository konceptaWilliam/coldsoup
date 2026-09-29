"use client";

import { forwardRef } from "react";
import { Blobatar } from "@blobatar/react";
import { _layout, type Expression } from "blobatar";
import { blobatarUri } from "blobatar/uri";
import { blobTraits, finishLayers, hexHue, type FormLook } from "@/lib/blob-evolution";
import type { BlobatarAnimate } from "@/lib/avatar";

/** Locked forms in Settings / the profile card: body and eyes one grey. */
export const SILHOUETTE = { head: "#9A988F", eye: "#9A988F" };
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
export const BlobForm = forwardRef<HTMLSpanElement, Props>(function BlobForm(
  { name, look, size, animate, expression, palette, silhouette, title },
  ref,
) {
  const traits = blobTraits(look.shape);
  const common = {
    name,
    traits,
    palette: silhouette ? SILHOUETTE : palette,
    expression,
    size,
    background: false as const,
  };
  const layer = (hue?: number, label?: string) =>
    animate ? (
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

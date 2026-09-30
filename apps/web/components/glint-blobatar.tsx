"use client";

import { useMemo, type CSSProperties } from "react";
import { blobatar, _layout, type Expression } from "blobatar";
import { _parts } from "blobatar/internal";
import type { BlobatarAnimate } from "@/lib/avatar";
import { glintFill, withGlints } from "@/lib/blob-eyes";

type Props = {
  name: string;
  size: number;
  /** Always carries the pinned eye; head is optional (silhouettes never get here). */
  palette: { head?: string; eye: string };
  hue?: number;
  traits?: Record<string, number>;
  expression?: Expression;
  animate?: BlobatarAnimate;
  title?: string;
  alt?: string;
  /** Splice catchlights into the eyes. Off below MIN_GLINT_SIZE. */
  glints: boolean;
};

// Same output as blobatar/react's static branch.
function svgUri(svg: string): string {
  const s = svg
    .replace(/"/g, "'")
    .replace(/[%#<>{}|\\^[\]`]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return "data:image/svg+xml," + s.replace(/\s+/g, " ");
}

// A <Blobatar> with catchlights spliced into the lib's own markup. Mirrors
// blobatar/react (2.7.0) branch for branch: an <img> when static; when
// animated, an inline <svg> with the lib's root class and motion vars, and the
// markup object keyed on the string so an expression change never re-sets
// innerHTML. Blink, gaze, idle motion, expressions and the morph therefore run
// exactly as they do on a plain <Blobatar>.
export function GlintBlobatar({
  name, size, palette, hue, traits, expression, animate, title, alt, glints,
}: Props) {
  const opts = { size, palette, hue, traits, expression, title, background: false as const };
  const dep = JSON.stringify([name, opts, animate, glints]);
  const fill = glintFill(palette.eye);

  const src = useMemo(() => {
    if (animate) return "";
    const svg = blobatar(name, opts);
    if (!glints) return svgUri(svg);
    // Static markup has the pose baked in, so read the posed eyes.
    const eyes = _layout(name, { traits, palette, hue, expression }).eyes;
    return svgUri(withGlints(svg, eyes, fill, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);

  const parts = useMemo(
    () => (animate ? _parts(name, { ...opts, animate }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dep],
  );

  // Animated markup is unposed (the pose is CSS on .mo-eye), so read the
  // unposed eyes; `inner` then doesn't vary with the expression either.
  const inner = useMemo(() => {
    if (!parts) return "";
    if (!glints) return parts.inner;
    return withGlints(parts.inner, _layout(name, { traits, palette, hue }).eyes, fill, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts?.inner, glints, fill]);
  const html = useMemo(() => ({ __html: inner }), [inner]);

  if (parts) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role={title ? "img" : undefined}
        aria-hidden={title ? undefined : true}
        style={parts.vars as CSSProperties}
      >
        {title ? <title>{title}</title> : null}
        <g className={parts.cls} dangerouslySetInnerHTML={html} />
      </svg>
    );
  }
  // A data: URI, as in blobatar/react; next/image has nothing to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={alt ?? title ?? ""} />;
}

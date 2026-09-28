"use client";

import { useEffect, useRef } from "react";
import { Blobatar } from "@blobatar/react";
import type { Expression } from "blobatar";
import { gaze } from "blobatar/gaze";
import { resolveBlobatar, type BlobatarAnimate } from "@/lib/avatar";

// Every user's avatar is their blobatar — profile photos are not supported.
export function Avatar({
  userId,
  name,
  size = 28,
  animate,
  expression,
  followPointer,
  pulsing,
  className = "",
}: {
  userId: string | null | undefined;
  name: string;
  size?: number;
  animate?: BlobatarAnimate;
  /** A held pose (blobatar/expression). Forces continuous animation so the
   * morph and looping poses (thinking) also run on touch screens. */
  expression?: Expression;
  /** Eyes track the mouse (desktop only; the library skips touch). */
  followPointer?: boolean;
  pulsing?: boolean;
  className?: string;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const blob = resolveBlobatar({
    userId,
    size,
    animate: expression || followPointer ? "always" : animate,
  });

  // `useGaze()` hands back a ref for <Blobatar ref>, which React 18 function
  // components never receive, so drive the svg directly instead.
  useEffect(() => {
    if (!followPointer || !blob.animate) return;
    const svg = wrapRef.current?.querySelector("svg");
    if (!svg) return;
    svg.style.setProperty("--mo-track-travel", "3px");
    const g = gaze(svg, { target: "pointer" });
    return () => g.stop();
  }, [followPointer, blob.animate, blob.name]);

  return (
    <span
      ref={wrapRef}
      className={`block flex-shrink-0 leading-none ${className}`}
      style={{
        width: size,
        height: size,
        animation: pulsing ? "breath 1.6s ease-out" : undefined,
      }}
      title={name}
    >
      {blob.animate ? (
        <Blobatar
          name={blob.name}
          palette={blob.palette}
          animate={blob.animate}
          expression={expression}
          size={size}
          background={false}
          title={name}
        />
      ) : (
        <Blobatar
          name={blob.name}
          palette={blob.palette}
          expression={expression}
          size={size}
          background={false}
          title={name}
          alt={name}
        />
      )}
    </span>
  );
}

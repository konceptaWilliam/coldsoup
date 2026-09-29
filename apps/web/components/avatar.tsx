"use client";

import { useEffect, useRef } from "react";
import type { Expression } from "blobatar";
import { gaze } from "blobatar/gaze";
import { resolveBlobatar, type BlobatarAnimate } from "@/lib/avatar";
import { formLook, type FormLook } from "@/lib/blob-evolution";
import { baseShapeOf } from "@/lib/blob-base";
import { useBlob } from "@/lib/use-blob";
import { BlobForm } from "@/components/blob-form";

const LV1: FormLook = { shape: null, finish: "plain" };

// Every user's avatar is their blobatar, drawn in the form they have equipped.
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
  const state = useBlob(userId);
  // Unknown users keep the neutral blob; levels only apply to real ids.
  const look = blob.palette ? LV1 : formLook(baseShapeOf(blob.name), state.form, state);

  // `useGaze()` hands back a ref for <Blobatar ref>, which React 18 function
  // components never receive, so drive the svgs directly instead. A finish
  // stacks several copies of the blob; every copy gets its own driver so the
  // eyes on each layer move together.
  useEffect(() => {
    if (!followPointer || !blob.animate) return;
    const svgs = Array.from(wrapRef.current?.querySelectorAll("svg") ?? []);
    const drivers = svgs.map((svg) => {
      svg.style.setProperty("--mo-track-travel", "3px");
      return gaze(svg, { target: "pointer" });
    });
    return () => drivers.forEach((g) => g.stop());
  }, [followPointer, blob.animate, blob.name, look.shape, look.finish]);

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
      <BlobForm
        name={blob.name}
        palette={blob.palette}
        look={look}
        size={size}
        animate={blob.animate}
        expression={expression}
        title={name}
      />
    </span>
  );
}

"use client";

import { Blobatar } from "@blobatar/react";
import { resolveBlobatar, type BlobatarAnimate } from "@/lib/avatar";

// Every user's avatar is their blobatar — profile photos are not supported.
export function Avatar({
  userId,
  name,
  size = 28,
  animate,
  pulsing,
  className = "",
}: {
  userId: string | null | undefined;
  name: string;
  size?: number;
  animate?: BlobatarAnimate;
  pulsing?: boolean;
  className?: string;
}) {
  const blob = resolveBlobatar({ userId, size, animate });
  return (
    <span
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
          size={size}
          background={false}
          title={name}
        />
      ) : (
        <Blobatar
          name={blob.name}
          palette={blob.palette}
          size={size}
          background={false}
          title={name}
          alt={name}
        />
      )}
    </span>
  );
}

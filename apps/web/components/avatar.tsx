"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Blobatar } from "@blobatar/react";
import { resolveBlobatar, type BlobatarAnimate } from "@/lib/avatar";

export function Avatar({
  userId,
  name,
  avatarUrl,
  size = 28,
  animate,
  pulsing,
  className = "",
}: {
  userId: string | null | undefined;
  name: string;
  avatarUrl?: string | null;
  size?: number;
  animate?: BlobatarAnimate;
  pulsing?: boolean;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  useEffect(() => setImgError(false), [avatarUrl]);

  const style = {
    width: size,
    height: size,
    animation: pulsing ? "breath 1.6s ease-out" : undefined,
  };

  if (avatarUrl && !imgError) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className={`rounded-sm object-cover flex-shrink-0 ${className}`}
        style={style}
        onError={() => setImgError(true)}
      />
    );
  }

  const blob = resolveBlobatar({ userId, size, animate });
  return (
    <span
      className={`block flex-shrink-0 leading-none ${className}`}
      style={style}
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

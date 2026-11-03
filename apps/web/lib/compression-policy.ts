// Pure rules for in-browser media compression (see compress-media.ts).
// No runtime imports, so it unit-tests with `node --test`.

export type MediaKind = "video" | "audio";

// Output targets. Video: ~16 MB per minute, so ~1.5 min fits in 25 MB.
// Audio is tuned for music: ~0.96 MB per minute stereo, ~25 min in 25 MB.
export const VIDEO_MAX_SIDE = 720;
export const VIDEO_BITRATE = 2_000_000;
export const VIDEO_AUDIO_BITRATE = 96_000;
export const AUDIO_BITRATE = 128_000;

// Files already at or below these total bitrates are left alone, so voice
// notes and ordinary MP3s are not re-encoded for nothing.
const VIDEO_SKIP_BITRATE = 2_500_000;
const AUDIO_SKIP_BITRATE = 160_000;

export type MediaProbe = {
  kind: MediaKind;
  sizeBytes: number;
  durationSec: number;
  width?: number;
  height?: number;
};

export function needsCompression(p: MediaProbe): boolean {
  // Unknown duration: can't judge the bitrate, so try; the caller keeps the
  // original if the result isn't smaller.
  if (!(p.durationSec > 0)) return true;
  const bitrate = (p.sizeBytes * 8) / p.durationSec;
  if (p.kind === "audio") return bitrate > AUDIO_SKIP_BITRATE;
  const longest = Math.max(p.width ?? 0, p.height ?? 0);
  return longest > VIDEO_MAX_SIDE || bitrate > VIDEO_SKIP_BITRATE;
}

// Fit the longest side into VIDEO_MAX_SIDE, keep the aspect ratio, never
// upscale, and round down to even numbers (H.264 needs even dimensions).
export function targetVideoSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, VIDEO_MAX_SIDE / Math.max(width, height));
  const even = (n: number) => Math.max(2, 2 * Math.floor((n * scale) / 2));
  return { width: even(width), height: even(height) };
}

export function compressedFileName(name: string, kind: MediaKind): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}.${kind === "video" ? "mp4" : "m4a"}`;
}

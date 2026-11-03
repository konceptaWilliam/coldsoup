import type { Input } from "mediabunny";
import { attachmentTypeFor } from "@/lib/file-utils";
import {
  AUDIO_BITRATE,
  VIDEO_AUDIO_BITRATE,
  VIDEO_BITRATE,
  compressedFileName,
  needsCompression,
  targetVideoSize,
} from "@/lib/compression-policy";

/**
 * Re-encodes video (≤720p H.264 + AAC, .mp4) and audio (AAC, .m4a) in the
 * browser with WebCodecs. Never throws: if the browser can't encode, the
 * conversion fails, or the result isn't smaller, the original is returned and
 * uploadAttachments' size check decides whether it can still go up.
 * onProgress gets 0..1.
 */
export async function compressMediaIfNeeded(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<File> {
  const kind = attachmentTypeFor(file);
  if (kind !== "video" && kind !== "audio") return file;

  let input: Input | undefined;
  try {
    // Loaded on demand so the encoder code is only fetched when media is sent.
    const mb = await import("mediabunny");
    input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });

    const videoTrack = kind === "video" ? await input.getPrimaryVideoTrack() : null;
    if (kind === "video" && !videoTrack) return file;

    const durationSec = await input.computeDuration();
    const probe = {
      kind,
      sizeBytes: file.size,
      durationSec,
      width: videoTrack?.displayWidth,
      height: videoTrack?.displayHeight,
    };
    if (!needsCompression(probe)) return file;

    if (!(await mb.canEncodeAudio("aac"))) return file;
    if (videoTrack && !(await mb.canEncodeVideo("avc"))) return file;

    const target = new mb.BufferTarget();
    const output = new mb.Output({
      // Moov atom up front so playback can start before the whole file loads.
      format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: videoTrack
        ? {
            ...targetVideoSize(videoTrack.displayWidth, videoTrack.displayHeight),
            fit: "contain",
            codec: "avc",
            bitrate: VIDEO_BITRATE,
          }
        : { discard: true },
      audio: { codec: "aac", bitrate: kind === "video" ? VIDEO_AUDIO_BITRATE : AUDIO_BITRATE },
      showWarnings: false,
    });
    if (!conversion.isValid) return file;

    if (onProgress) conversion.onProgress = (progress) => onProgress(progress);
    await conversion.execute();

    const buffer = target.buffer;
    if (!buffer || buffer.byteLength >= file.size) return file;
    return new File([buffer], compressedFileName(file.name, kind), {
      type: kind === "video" ? "video/mp4" : "audio/mp4",
    });
  } catch (err) {
    console.warn("[compress-media] keeping original", file.name, err);
    return file;
  } finally {
    input?.dispose();
  }
}

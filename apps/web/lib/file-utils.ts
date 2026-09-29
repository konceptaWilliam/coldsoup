export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — images, audio, docs
export const MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25 MB — video (free-tier friendly)

const IMAGE_LIST = ["jpg", "jpeg", "png", "gif", "webp"];
const AUDIO_LIST = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
const VIDEO_LIST = ["mp4", "mov", "m4v", "webm"];
const FILE_LIST = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip"];

export const IMAGE_EXT = new Set(IMAGE_LIST);
export const AUDIO_EXT = new Set(AUDIO_LIST);
export const VIDEO_EXT = new Set(VIDEO_LIST);
export const FILE_EXT = new Set(FILE_LIST);

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/m4a", "audio/aac", "audio/flac", "audio/x-m4a",
  "video/mp4", "video/quicktime", "video/x-m4v", "video/webm",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "application/zip",
]);

export const ALLOWED_EXTENSIONS = new Set(
  IMAGE_LIST.concat(AUDIO_LIST, VIDEO_LIST, FILE_LIST),
);

export type AttachmentType = "image" | "audio" | "video" | "file";

export function attachmentTypeFor(file: { name: string; type: string }): AttachmentType {
  // MIME wins over extension — e.g. an audio/webm voice note must not be
  // mistaken for video just because ".webm" is in VIDEO_EXT.
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.has(ext)) return "image";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (VIDEO_EXT.has(ext)) return "video";
  return "file";
}

export type FileValidationError = { file: string; reason: string };

export function validateFile(file: File): FileValidationError | null {
  const isVideo = attachmentTypeFor(file) === "video";
  const limit = isVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
  if (file.size > limit) {
    const mb = Math.round(limit / 1024 / 1024).toString();
    return { file: file.name, reason: `exceeds ${mb} MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)` };
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIME_TYPES.has(file.type)) {
    return { file: file.name, reason: "file type not allowed" };
  }
  return null;
}

const MAX_IMAGE_DIM = 1600;
const WEBP_QUALITY = 0.8;

// Downscale to MAX_IMAGE_DIM and re-encode to WebP (smaller than JPEG, strips
// EXIF). Re-encodes even when already within size — a high-quality PNG/JPEG
// screenshot shrinks a lot as WebP — but keeps the original if WebP isn't
// actually smaller. Skips GIFs (would lose animation).
export async function resizeImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(w, h));

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));

      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          // Keep the original if encoding failed or didn't shrink it.
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          const baseName = file.name.replace(/\.[^.]+$/, "");
          resolve(new File([blob], `${baseName}.webp`, { type: "image/webp" }));
        },
        "image/webp",
        WEBP_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // Fall back to original on decode error
    };

    img.src = objectUrl;
  });
}

const MAX_DIMENSION = 20000;

function validDims(width: number, height: number): { width: number; height: number } | null {
  return width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION
    ? { width: Math.round(width), height: Math.round(height) }
    : null;
}

/** Intrinsic width/height of an image or video file, or null if unknown. */
export async function mediaDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    if (file.type.startsWith("image/")) {
      if (typeof createImageBitmap === "function") {
        const bmp = await createImageBitmap(file);
        const dims = validDims(bmp.width, bmp.height);
        bmp.close();
        return dims;
      }
      return await new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(validDims(img.naturalWidth, img.naturalHeight));
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    }
    if (file.type.startsWith("video/")) {
      return await new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.preload = "metadata";
        const done = (dims: { width: number; height: number } | null) => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          video.removeAttribute("src");
          resolve(dims);
        };
        const timer = setTimeout(() => done(null), 3000);
        video.onloadedmetadata = () => done(validDims(video.videoWidth, video.videoHeight));
        video.onerror = () => done(null);
        video.src = url;
      });
    }
  } catch {
    // Unsupported format (e.g. HEIC in some browsers) — send without dimensions.
  }
  return null;
}

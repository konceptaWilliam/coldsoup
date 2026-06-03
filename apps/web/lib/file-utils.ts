export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — images, audio, docs
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB — video

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
    const mb = isVideo ? "100" : "25";
    return { file: file.name, reason: `exceeds ${mb} MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)` };
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext) && !ALLOWED_MIME_TYPES.has(file.type)) {
    return { file: file.name, reason: "file type not allowed" };
  }
  return null;
}

const MAX_IMAGE_DIM = 1920;
const JPEG_QUALITY = 0.85;

export async function resizeImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    // Don't process non-images or GIFs (would lose animation)
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const { naturalWidth: w, naturalHeight: h } = img;

      if (w <= MAX_IMAGE_DIM && h <= MAX_IMAGE_DIM) {
        // Already small enough — skip re-encoding
        resolve(file);
        return;
      }

      const scale = MAX_IMAGE_DIM / Math.max(w, h);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          // Rename to .jpg since we always output JPEG
          const baseName = file.name.replace(/\.[^.]+$/, "");
          resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // Fall back to original on decode error
    };

    img.src = objectUrl;
  });
}

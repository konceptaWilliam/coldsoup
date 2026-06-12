import { supabase } from "./supabase";
import type { MessageAttachment } from "@coldsoup/core";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);
const VIDEO_EXT = new Set(["mp4", "mov", "m4v", "webm"]);
const FILE_EXT = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip"]);
const ALLOWED_EXTENSIONS = new Set([...IMAGE_EXT, ...AUDIO_EXT, ...VIDEO_EXT, ...FILE_EXT]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — images, audio, documents
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB — video clips

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv", zip: "application/zip",
};

// RFC4122-ish v4, lowercase hex + hyphens — matches the server's attachment path regex.
// Also used as the message client_id for optimistic-send dedup.
export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface PickedAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

// Uploads to the `attachments` bucket at `<userId>/<uuid>.<ext>` so the public
// URL passes the server's validateAttachmentUrl gate. Mirrors the web app.
export async function uploadAttachment(asset: PickedAsset): Promise<MessageAttachment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rawExt = (asset.fileName?.split(".").pop() ?? asset.uri.split("?")[0].split(".").pop() ?? "jpg").toLowerCase();
  const mime = asset.mimeType ?? "";
  // Keep a recognized extension; for images with an odd extension fall back to jpg.
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : mime.startsWith("image/") ? "jpg" : rawExt;
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`Unsupported file type: .${ext}`);

  const contentType = asset.mimeType ?? MIME_BY_EXT[ext] ?? "application/octet-stream";
  const isVideo = VIDEO_EXT.has(ext);

  const arrayBuffer = await (await fetch(asset.uri)).arrayBuffer();
  const limit = isVideo ? MAX_VIDEO_BYTES : MAX_BYTES;
  if (arrayBuffer.byteLength > limit) {
    throw new Error(`File too large (max ${isVideo ? "100" : "25"} MB)`);
  }

  const path = `${user.id}/${uuid()}.${ext}`;

  const { error } = await supabase.storage.from("attachments").upload(path, arrayBuffer, { contentType });
  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);

  const type: MessageAttachment["type"] = IMAGE_EXT.has(ext)
    ? "image"
    : AUDIO_EXT.has(ext)
      ? "audio"
      : isVideo
        ? "video"
        : "file";

  return {
    url: publicUrl,
    type,
    name: asset.fileName ?? `attachment.${ext}`,
  };
}

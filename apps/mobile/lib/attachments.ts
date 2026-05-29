import { supabase } from "./supabase";
import type { MessageAttachment } from "@coldsoup/core";

const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp",
  "mp3", "wav", "ogg", "m4a", "aac", "flac",
]);

// RFC4122-ish v4, lowercase hex + hyphens — matches the server's attachment path regex.
function uuid(): string {
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
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : "jpg";
  const contentType = asset.mimeType ?? (ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg");

  const arrayBuffer = await (await fetch(asset.uri)).arrayBuffer();
  const path = `${user.id}/${uuid()}.${ext}`;

  const { error } = await supabase.storage.from("attachments").upload(path, arrayBuffer, { contentType });
  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);

  return {
    url: publicUrl,
    type: contentType.startsWith("image/") ? "image" : "audio",
    name: asset.fileName ?? `attachment.${ext}`,
  };
}

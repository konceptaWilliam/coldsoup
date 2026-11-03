import { createClient } from "@/lib/supabase/client";
import { resizeImageIfNeeded, attachmentTypeFor, mediaDimensions, uploadSizeError } from "@/lib/file-utils";
import { compressMediaIfNeeded } from "@/lib/compress-media";
import type { Attachment } from "./thread-types";

/** A file is still over the upload limit after compression. Message is user-facing. */
export class AttachmentTooLargeError extends Error {}

function isMedia(file: File): boolean {
  const type = attachmentTypeFor(file);
  return type === "video" || type === "audio";
}

// Raw XHR against the storage REST endpoint — supabase-js upload() exposes
// no progress events, and a 100 MB video behind a bare spinner feels hung.
function xhrUpload(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (loadedBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

/**
 * Compresses video/audio, resizes images, then uploads to the attachments
 * bucket. onProgress gets 0..0.99; when the batch has video or audio, the
 * first half is compression and the second half upload.
 */
export async function uploadAttachments(
  files: File[],
  onProgress: (fraction: number) => void,
): Promise<Attachment[]> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!session || !user) throw new Error("Not authenticated");

  const prepShare = files.some(isMedia) ? 0.5 : 0;
  const prepDone = files.map(() => 0);
  const reportPrep = () =>
    onProgress(prepShare * (prepDone.reduce((a, b) => a + b, 0) / files.length));
  onProgress(0);

  // One file at a time: parallel WebCodecs encodes fight over the hardware
  // encoder (iOS allows very few sessions) and multiply peak memory.
  // Measure the prepared file so the stored box matches what renders.
  const prepared: { raw: File; file: File; dims: { width: number; height: number } | null }[] = [];
  for (let i = 0; i < files.length; i++) {
    const raw = files[i];
    const file = isMedia(raw)
      ? await compressMediaIfNeeded(raw, (p) => {
          prepDone[i] = p;
          reportPrep();
        })
      : await resizeImageIfNeeded(raw);
    prepDone[i] = 1;
    reportPrep();
    const tooLarge = uploadSizeError(file);
    if (tooLarge) throw new AttachmentTooLargeError(tooLarge);
    prepared.push({ raw, file, dims: await mediaDimensions(file) });
  }

  const totalBytes = prepared.reduce((s, p) => s + p.file.size, 0) || 1;
  const loadedBytes = prepared.map(() => 0);
  const report = () =>
    onProgress(
      Math.min(0.99, prepShare + (1 - prepShare) * (loadedBytes.reduce((a, b) => a + b, 0) / totalBytes)),
    );

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return Promise.all(
    prepared.map(async ({ raw, file, dims }, i) => {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      await xhrUpload(
        `${baseUrl}/storage/v1/object/attachments/${path}`,
        file,
        {
          authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
          "content-type": file.type || "application/octet-stream",
          "cache-control": "max-age=3600",
          "x-upsert": "false",
        },
        (loaded) => {
          loadedBytes[i] = loaded;
          report();
        },
      );
      const {
        data: { publicUrl },
      } = supabase.storage.from("attachments").getPublicUrl(path);
      // name stays the picked file's name: retry and the outbox match uploads
      // to files by name.
      return {
        url: publicUrl,
        type: attachmentTypeFor(raw),
        name: raw.name,
        ...(dims ?? {}),
      };
    }),
  );
}

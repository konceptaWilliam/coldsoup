import { createClient } from "@/lib/supabase/client";
import { resizeImageIfNeeded, attachmentTypeFor } from "@/lib/file-utils";
import type { Attachment } from "./thread-types";

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

/** Resizes and uploads files to the attachments bucket. onProgress gets 0..0.99. */
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

  // Resize first so progress is measured against the bytes actually sent.
  const prepared = await Promise.all(
    files.map(async (raw) => ({ raw, file: await resizeImageIfNeeded(raw) })),
  );
  const totalBytes = prepared.reduce((s, p) => s + p.file.size, 0) || 1;
  const loadedBytes = prepared.map(() => 0);
  const report = () =>
    onProgress(Math.min(0.99, loadedBytes.reduce((a, b) => a + b, 0) / totalBytes));
  onProgress(0);

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return Promise.all(
    prepared.map(async ({ raw, file }, i) => {
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
      return {
        url: publicUrl,
        type: attachmentTypeFor(raw),
        name: raw.name,
      };
    }),
  );
}

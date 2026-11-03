import type { SupabaseClient } from "@supabase/supabase-js";
import { attachmentPathFromUrl } from "@/lib/message-policy";
import { findOrphans, type StoredObject } from "@/lib/attachment-sweep-policy";

const BUCKET = "attachments";
const PAGE = 1000; // PostgREST and Storage list both cap at 1000 rows.
const MAX_DELETES_PER_RUN = 1000; // Keeps one run well inside the function timeout.
const REMOVE_BATCH = 100;

export type SweepResult = {
  orphanCount: number;
  orphanBytes: number;
  deleted: number;
  clearedMessages: number;
  largest: { path: string; sizeBytes: number }[];
};

type ListEntry = {
  name: string;
  id: string | null;
  created_at: string;
  metadata: { size?: number } | null;
};

async function listAll(admin: SupabaseClient, prefix: string): Promise<ListEntry[]> {
  const all: ListEntry[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
    all.push(...(data as unknown as ListEntry[]));
    if (data.length < PAGE) return all;
  }
}

// Objects live at <userId>/<file>. Root entries without an id are folders.
async function listObjects(admin: SupabaseClient): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  for (const folder of await listAll(admin, "")) {
    if (folder.id) continue;
    for (const f of await listAll(admin, folder.name)) {
      if (!f.id) continue;
      objects.push({
        path: `${folder.name}/${f.name}`,
        sizeBytes: f.metadata?.size ?? 0,
        createdAt: f.created_at,
      });
    }
  }
  return objects;
}

// Paths used by live messages. A message inserted while paging may be missed,
// but its files are younger than ORPHAN_MIN_AGE_MS and so never swept.
async function referencedPaths(admin: SupabaseClient, supabaseUrl: string): Promise<Set<string>> {
  const refs = new Set<string>();
  const add = (url: unknown) => {
    const path = typeof url === "string" ? attachmentPathFromUrl(url, supabaseUrl) : null;
    if (path) refs.add(path);
  };
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("messages")
      .select("id, attachments, reply_to_attachment_url")
      .eq("is_deleted", false)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`messages: ${error.message}`);
    for (const m of data) {
      for (const a of (m.attachments ?? []) as { url?: unknown }[]) add(a.url);
      add(m.reply_to_attachment_url);
    }
    if (data.length < PAGE) return refs;
  }
}

export async function sweepAttachments(
  admin: SupabaseClient,
  supabaseUrl: string,
  opts: { dryRun: boolean; now?: number },
): Promise<SweepResult> {
  const [objects, refs] = await Promise.all([
    listObjects(admin),
    referencedPaths(admin, supabaseUrl),
  ]);
  const orphans = findOrphans(objects, refs, opts.now ?? Date.now());

  const result: SweepResult = {
    orphanCount: orphans.length,
    orphanBytes: orphans.reduce((s, o) => s + o.sizeBytes, 0),
    deleted: 0,
    clearedMessages: 0,
    largest: [...orphans]
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 20)
      .map(({ path, sizeBytes }) => ({ path, sizeBytes })),
  };
  if (opts.dryRun) return result;

  const toDelete = orphans.slice(0, MAX_DELETES_PER_RUN).map((o) => o.path);
  for (let i = 0; i < toDelete.length; i += REMOVE_BATCH) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .remove(toDelete.slice(i, i + REMOVE_BATCH));
    if (error) throw new Error(`remove: ${error.message}`);
    result.deleted += data?.length ?? 0;
  }

  // Deleted messages from before deleteMessage cleared this column.
  const { data: cleared, error } = await admin
    .from("messages")
    .update({ attachments: [] })
    .eq("is_deleted", true)
    .neq("attachments", "[]")
    .select("id");
  if (error) throw new Error(`clear attachments: ${error.message}`);
  result.clearedMessages = cleared?.length ?? 0;

  return result;
}

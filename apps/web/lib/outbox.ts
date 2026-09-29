import type { Attachment, ReplyTo } from "./thread-types";

// Unsent messages per thread, persisted so they survive a reload. Files can't
// be persisted; missingFiles lists the ones that never finished uploading.
export type OutboxEntry = {
  clientId: string;
  createdAt: string;
  body: string;
  replyTo: ReplyTo | null;
  replyToId?: string;
  replyToAttachmentUrl?: string | null;
  attachments: Attachment[];
  missingFiles: string[];
  permanent?: boolean;
};

const OUTBOX_PREFIX = "coldsoup:outbox:";

// Pre-optimistic-chat entries: { failId, clientId, created_at, … } without
// missingFiles. Normalised on read.
type LegacyEntry = Partial<OutboxEntry> & { created_at?: string; clientId: string };

export function readOutbox(threadId: string): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(OUTBOX_PREFIX + threadId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as LegacyEntry[])
      .filter((e) => typeof e?.clientId === "string")
      .map((e) => ({
        clientId: e.clientId,
        createdAt: e.createdAt ?? e.created_at ?? new Date().toISOString(),
        body: e.body ?? "",
        replyTo: e.replyTo ?? null,
        replyToId: e.replyToId,
        replyToAttachmentUrl: e.replyToAttachmentUrl ?? null,
        attachments: e.attachments ?? [],
        missingFiles: e.missingFiles ?? [],
        permanent: e.permanent,
      }));
  } catch {
    return [];
  }
}

export function writeOutbox(threadId: string, entries: OutboxEntry[]): void {
  try {
    if (entries.length === 0) localStorage.removeItem(OUTBOX_PREFIX + threadId);
    else localStorage.setItem(OUTBOX_PREFIX + threadId, JSON.stringify(entries));
  } catch {}
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MessageAttachment } from "@coldsoup/core";

// A failed/queued outgoing message, persisted per thread so it survives app
// restarts. Attachments are already-uploaded public URLs, so retry only needs
// to re-run the send mutation.
export type OutboxEntry = {
  failId: string;
  body: string;
  attachments: MessageAttachment[];
  replyToId?: string;
  created_at: string;
};

const prefix = "coldsoup:outbox:";
const key = (threadId: string) => `${prefix}${threadId}`;

export async function getOutbox(threadId: string): Promise<OutboxEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(key(threadId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

export function setOutbox(threadId: string, entries: OutboxEntry[]) {
  if (entries.length === 0) {
    AsyncStorage.removeItem(key(threadId)).catch(() => {});
  } else {
    AsyncStorage.setItem(key(threadId), JSON.stringify(entries)).catch(() => {});
  }
}

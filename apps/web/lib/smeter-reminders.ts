// Pure helpers for unanswered-S-meter reminders: the cron hour gate, badge
// aggregation, and per-S-meter push batches. No aliases/server-only — the
// Node tests import this file directly.

export const REMINDER_TITLE = "Du har en obesvarad S-mätare!";

// One row of public.pending_smeters(): a user who hasn't answered an S-meter.
export type PendingRow = {
  user_id: string;
  smeter_id: string;
  thread_id: string;
  group_id: string;
  message_id: string;
  title: string | null;
  thread_title: string | null;
  group_name: string | null;
};

export type ReminderBatch = {
  smeterId: string;
  threadId: string;
  groupId: string;
  messageId: string;
  userIds: string[];
  location: string;
  expoBody: string;
  webBody: string;
};

// Vercel cron runs in UTC; two schedules (07 and 08 UTC) cover CET and CEST,
// and only the run that lands in this Stockholm hour acts.
export function isStockholmHour(date: Date, hour: number): boolean {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return Number(h) === hour;
}

export function groupPending(rows: { threadId: string; groupId: string }[]): {
  byThread: Record<string, number>;
  groups: Set<string>;
} {
  const byThread: Record<string, number> = {};
  const groups = new Set<string>();
  for (const r of rows) {
    byThread[r.threadId] = (byThread[r.threadId] ?? 0) + 1;
    groups.add(r.groupId);
  }
  return { byThread, groups };
}

export function reminderBatches(rows: PendingRow[]): ReminderBatch[] {
  const bySmeter = new Map<string, ReminderBatch>();
  for (const r of rows) {
    let b = bySmeter.get(r.smeter_id);
    if (!b) {
      const location = `.${r.group_name ?? ""}#${r.thread_title ?? ""}`;
      b = {
        smeterId: r.smeter_id,
        threadId: r.thread_id,
        groupId: r.group_id,
        messageId: r.message_id,
        userIds: [],
        location,
        expoBody: r.title ?? "Tryck för att svara",
        webBody: r.title ? `${location}\n${r.title}` : location,
      };
      bySmeter.set(r.smeter_id, b);
    }
    b.userIds.push(r.user_id);
  }
  return Array.from(bySmeter.values());
}

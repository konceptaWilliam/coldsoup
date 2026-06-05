// Client-safe (no admin) rendering helpers for system messages. Shared by the
// server (to snapshot the body text) and the web client (to render the notice).
import type { SystemEvent } from "@coldsoup/core";

export type { SystemEvent };

export function formatDueDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function systemEventText(e: SystemEvent): string {
  switch (e.kind) {
    case "status":
      return `${e.actorName} changed thread from ${e.from} to ${e.to}`;
    case "smeter_done":
      return `The ${e.smeterTitle ?? "S-meter"} s-meter is done.`;
    case "due_date":
      return e.dueDate
        ? `${e.actorName} set thread due date to ${formatDueDate(e.dueDate)}`
        : `${e.actorName} cleared the thread due date`;
    case "thread_created":
      return `${e.actorName} created this thread`;
    default:
      return "";
  }
}

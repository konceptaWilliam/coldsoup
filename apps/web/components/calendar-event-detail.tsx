"use client";

import { trpc } from "@/lib/trpc/client";
import { CalendarEvent, formatEventTime, toYMD } from "@/lib/calendar";

type Props = {
  groupId: string;
  event: CalendarEvent;
  onEdit: () => void;
  onClose: () => void;
};

function formatDayRange(event: CalendarEvent): string {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (toYMD(start) === toYMD(end)) return fmt(start);
  return `${fmt(start)} → ${fmt(end)}`;
}

export function CalendarEventDetail({ groupId, event, onEdit, onClose }: Props) {
  const utils = trpc.useUtils();
  const del = trpc.calendar.delete.useMutation({
    onSuccess: () => {
      utils.calendar.list.invalidate({ groupId });
      onClose();
    },
  });

  function handleDelete() {
    if (!confirm("Delete this event?")) return;
    del.mutate({ eventId: event.id });
  }

  const rowLabel = "font-mono text-[10px] text-muted uppercase tracking-wider mb-1";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border border-border w-full max-w-md mx-4 p-6 max-h-[88vh] overflow-y-auto">
        {/* Header: color dot + title + close */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <span
              className="w-3.5 h-3.5 mt-1 flex-shrink-0 border border-border"
              style={{ background: event.color }}
            />
            <h2 className="font-mono text-base font-semibold text-ink break-words">{event.title}</h2>
          </div>
          <button onClick={onClose} className="font-mono text-[14px] text-muted hover:text-ink flex-shrink-0">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <p className={rowLabel}>When</p>
            <p className="text-sm text-ink">{formatDayRange(event)}</p>
            <p className="text-sm text-muted font-mono">{formatEventTime(event)}</p>
          </div>

          {event.location && (
            <div>
              <p className={rowLabel}>Location</p>
              <p className="text-sm text-ink break-words">{event.location}</p>
            </div>
          )}

          {event.description && (
            <div>
              <p className={rowLabel}>Description</p>
              <p className="text-sm text-ink whitespace-pre-wrap break-words">{event.description}</p>
            </div>
          )}

          {event.creator && (
            <div>
              <p className={rowLabel}>Added by</p>
              <p className="text-sm text-muted">{event.creator.display_name}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-5 mt-5 border-t border-border">
          <button
            type="button"
            onClick={handleDelete}
            disabled={del.isPending}
            className="font-mono text-xs text-muted hover:text-red-600 px-2 py-2 disabled:opacity-40 transition-colors"
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="font-mono text-sm text-muted hover:text-ink px-4 py-2 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="bg-ink text-surface font-mono text-sm font-medium px-4 py-2 hover:bg-ink/90 transition-colors"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { CalendarEventDialog } from "./calendar-event-dialog";
import { CalendarEventDetail } from "./calendar-event-detail";
import {
  CalendarEvent,
  eventCoversDay,
  formatEventTime,
  readableInk,
  toYMD,
} from "@/lib/calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

// Monday-indexed day of week (0 = Mon … 6 = Sun).
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

type DialogState =
  | { mode: "create"; date: string }
  | { mode: "view"; event: CalendarEvent }
  | { mode: "edit"; event: CalendarEvent }
  | null;

export function GroupCalendar({
  groupId,
  groupName,
  onClose,
}: {
  groupId: string;
  groupName: string;
  onClose: () => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [dialog, setDialog] = useState<DialogState>(null);

  const utils = trpc.useUtils();
  const { data: rawEvents = [], isLoading } = trpc.calendar.list.useQuery({ groupId });
  const events = rawEvents as unknown as CalendarEvent[];

  // Realtime: any insert/update/delete to this group's events refetches the list.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`calendar:group:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_events", filter: `group_id=eq.${groupId}` },
        () => utils.calendar.list.invalidate({ groupId })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId, utils]);

  // 42 cells (6 weeks) starting on the Monday on/before the 1st of the month.
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - mondayIndex(first));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const cell of cells) {
      const ymd = toYMD(cell);
      map.set(
        ymd,
        events
          .filter((e) => eventCoversDay(e, ymd))
          .sort((a, b) => a.start_at.localeCompare(b.start_at))
      );
    }
    return map;
  }, [cells, events]);

  const todayYMD = toYMD(today);
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en", {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function goToday() {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
  }

  const navBtn =
    "w-9 h-9 flex items-center justify-center border border-border text-muted hover:text-ink hover:border-border-strong transition-colors font-mono text-sm";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center bg-ink/20"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border border-border w-full md:max-w-3xl md:mx-4 h-full md:h-[90vh] flex flex-col">
        {/* Header */}
        <header className="px-4 py-3 border-b border-border flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-mono text-sm font-semibold text-ink truncate">
              <span className="text-muted-2">· </span>
              <span className="lowercase">{groupName}</span>
              <span className="text-muted-2"> / calendar</span>
            </span>
          </div>
          <button
            onClick={() => setDialog({ mode: "create", date: todayYMD })}
            className="font-mono text-[11px] px-2.5 py-2 border border-pastel-deep text-pastel-ink flex items-center min-h-[36px]"
            style={{ background: "var(--pastel)" }}
          >
            + event
          </button>
          <button
            onClick={onClose}
            aria-label="Close calendar"
            className="w-9 h-9 flex items-center justify-center text-muted hover:text-ink font-mono text-base flex-shrink-0"
          >
            ×
          </button>
        </header>

        {/* Month nav */}
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-shrink-0">
          <button onClick={() => shiftMonth(-1)} className={navBtn} aria-label="Previous month">‹</button>
          <button onClick={() => shiftMonth(1)} className={navBtn} aria-label="Next month">›</button>
          <span className="font-mono text-sm text-ink ml-1 flex-1">{monthLabel}</span>
          <button
            onClick={goToday}
            className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink border border-border hover:border-border-strong px-3 py-2 transition-colors"
          >
            Today
          </button>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 border-b border-border flex-shrink-0">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted text-center"
            >
              {w}
            </div>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-mono text-sm text-muted">loading…</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-7 grid-rows-6 h-full min-h-[480px]">
              {cells.map((cell) => {
                const ymd = toYMD(cell);
                const inMonth = cell.getMonth() === cursor.month;
                const isToday = ymd === todayYMD;
                const dayEvents = eventsByDay.get(ymd) ?? [];
                const shown = dayEvents.slice(0, MAX_CHIPS);
                const extra = dayEvents.length - shown.length;

                return (
                  <button
                    key={ymd}
                    onClick={() => setDialog({ mode: "create", date: ymd })}
                    className={`border-b border-r border-border p-1 text-left flex flex-col gap-0.5 overflow-hidden min-h-[80px] transition-colors hover:bg-border/20 ${
                      inMonth ? "" : "bg-surface-2/50"
                    }`}
                  >
                    <span
                      className={`font-mono text-[11px] leading-none mb-0.5 w-5 h-5 flex items-center justify-center flex-shrink-0 ${
                        isToday ? "bg-ink text-surface" : inMonth ? "text-ink" : "text-muted-2"
                      }`}
                    >
                      {cell.getDate()}
                    </span>
                    {shown.map((ev) => (
                      <span
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDialog({ mode: "view", event: ev });
                        }}
                        title={`${ev.title} · ${formatEventTime(ev)}`}
                        className="font-mono text-[10px] leading-tight px-1 py-0.5 truncate cursor-pointer"
                        style={{ background: ev.color, color: readableInk(ev.color) }}
                      >
                        {ev.title}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className="font-mono text-[9px] text-muted px-1">+{extra} more</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {dialog?.mode === "view" && (
        <CalendarEventDetail
          groupId={groupId}
          event={dialog.event}
          onEdit={() => setDialog({ mode: "edit", event: dialog.event })}
          onClose={() => setDialog(null)}
        />
      )}

      {(dialog?.mode === "create" || dialog?.mode === "edit") && (
        <CalendarEventDialog
          groupId={groupId}
          initialDate={dialog.mode === "create" ? dialog.date : undefined}
          event={dialog.mode === "edit" ? dialog.event : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

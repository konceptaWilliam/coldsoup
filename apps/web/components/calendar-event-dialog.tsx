"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  CalendarEvent,
  DEFAULT_EVENT_COLOR,
  EVENT_COLORS,
  fromDateTime,
  toYMD,
  toHM,
  readableInk,
} from "@/lib/calendar";

const pad2 = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad2(i * 5));

// 24-hour time picker (HH:MM) built from two selects. Native <input type="time">
// renders AM/PM under en-US locale and ignores `lang`, so we control it ourselves.
function TimeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string; // "HH:MM"
  onChange: (next: string) => void;
}) {
  const [hh, mm] = value.split(":");
  // Keep an off-grid minute (e.g. 07) selectable so existing events round-trip.
  const minuteOptions = MINUTES.includes(mm) ? MINUTES : [...MINUTES, mm].sort();
  const selectCls =
    "border border-border bg-surface-2 px-2 py-2.5 text-sm text-ink focus:outline-none focus:border-ink transition-colors";

  return (
    <div className="flex items-center gap-1">
      <select
        id={id}
        aria-label="Hour"
        value={hh}
        onChange={(e) => onChange(`${e.target.value}:${mm}`)}
        className={selectCls}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="font-mono text-sm text-muted">:</span>
      <select
        aria-label="Minute"
        value={mm}
        onChange={(e) => onChange(`${hh}:${e.target.value}`)}
        className={selectCls}
      >
        {minuteOptions.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

type Props = {
  groupId: string;
  // Pre-selected day (YYYY-MM-DD) when creating from a calendar cell.
  initialDate?: string;
  // Existing event when editing; absent when creating.
  event?: CalendarEvent;
  onClose: () => void;
};

export function CalendarEventDialog({ groupId, initialDate, event, onClose }: Props) {
  const utils = trpc.useUtils();
  const titleRef = useRef<HTMLInputElement>(null);
  const isEdit = !!event;

  const baseDate = initialDate ?? toYMD(new Date());
  const init = event
    ? {
        title: event.title,
        description: event.description ?? "",
        startDate: toYMD(new Date(event.start_at)),
        startTime: toHM(new Date(event.start_at)),
        endDate: toYMD(new Date(event.end_at)),
        endTime: toHM(new Date(event.end_at)),
        location: event.location ?? "",
        color: event.color,
      }
    : {
        title: "",
        description: "",
        startDate: baseDate,
        startTime: "09:00",
        endDate: baseDate,
        endTime: "10:00",
        location: "",
        color: DEFAULT_EVENT_COLOR,
      };

  const [title, setTitle] = useState(init.title);
  const [description, setDescription] = useState(init.description);
  const [startDate, setStartDate] = useState(init.startDate);
  const [startTime, setStartTime] = useState(init.startTime);
  const [endDate, setEndDate] = useState(init.endDate);
  const [endTime, setEndTime] = useState(init.endTime);
  const [location, setLocation] = useState(init.location);
  const [color, setColor] = useState(init.color);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const create = trpc.calendar.create.useMutation({
    onSuccess: () => {
      utils.calendar.list.invalidate({ groupId });
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  const update = trpc.calendar.update.useMutation({
    onSuccess: () => {
      utils.calendar.list.invalidate({ groupId });
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  const del = trpc.calendar.delete.useMutation({
    onSuccess: () => {
      utils.calendar.list.invalidate({ groupId });
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const pending = create.isPending || update.isPending || del.isPending;

  // When the start day/time moves while creating, keep a 1h slot by shifting
  // the end with it (only if the user hasn't pulled end before start).
  function onStartTimeChange(value: string) {
    setStartTime(value);
    if (!isEdit && startDate === endDate) {
      const start = fromDateTime(startDate, value);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      setEndDate(toYMD(end));
      setEndTime(toHM(end));
    }
  }

  function onStartDateChange(value: string) {
    setStartDate(value);
    // Drag the end date along if it would otherwise precede the new start.
    if (endDate < value) setEndDate(value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return;

    const start = fromDateTime(startDate, startTime);
    const end = fromDateTime(endDate, endTime);
    if (end.getTime() < start.getTime()) {
      setError("End must be after start");
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      location: location.trim() || null,
      color,
    };

    if (isEdit && event) {
      update.mutate({ eventId: event.id, ...payload });
    } else {
      create.mutate({ groupId, ...payload });
    }
  }

  function handleDelete() {
    if (!event) return;
    if (!confirm("Delete this event?")) return;
    del.mutate({ eventId: event.id });
  }

  const labelCls = "block font-mono text-[10px] text-muted uppercase tracking-wider mb-2";
  const inputCls =
    "w-full border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-ink transition-colors";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border border-border w-full max-w-md mx-4 p-6 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-mono text-sm font-semibold text-ink">
            {isEdit ? "Edit event" : "New event"}
          </h2>
          <button onClick={onClose} className="font-mono text-[14px] text-muted hover:text-ink">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="event-title" className={labelCls}>Name</label>
            <input
              ref={titleRef}
              id="event-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting, deadline, …"
              maxLength={200}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="event-description" className={labelCls}>Description</label>
            <textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details, agenda, notes…"
              maxLength={2000}
              rows={3}
              className={`${inputCls} resize-y min-h-[68px]`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="event-start-date" className={labelCls}>Start date</label>
              <input
                id="event-start-date"
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="event-start-time" className={labelCls}>Start time</label>
              <TimeField id="event-start-time" value={startTime} onChange={onStartTimeChange} />
            </div>
            <div>
              <label htmlFor="event-end-date" className={labelCls}>End date</label>
              <input
                id="event-end-date"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="event-end-time" className={labelCls}>End time</label>
              <TimeField id="event-end-time" value={endTime} onChange={setEndTime} />
            </div>
          </div>

          <div>
            <label htmlFor="event-location" className={labelCls}>Location</label>
            <input
              id="event-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
              maxLength={200}
              className={inputCls}
            />
          </div>

          <div>
            <span className={labelCls}>Color</span>
            <div className="flex items-center gap-2 flex-wrap">
              {EVENT_COLORS.map((c) => {
                const active = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                    aria-pressed={active}
                    className="w-8 h-8 border transition-all"
                    style={{
                      background: c,
                      borderColor: active ? "var(--ink)" : "var(--border)",
                      boxShadow: active ? "inset 0 0 0 2px var(--surface)" : "none",
                    }}
                  />
                );
              })}
              <label
                className="w-8 h-8 border border-border flex items-center justify-center cursor-pointer relative overflow-hidden"
                style={{ background: color }}
                title="Custom color"
              >
                <span
                  className="font-mono text-[12px] font-semibold"
                  style={{ color: readableInk(color) }}
                >
                  +
                </span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="font-mono text-xs text-muted hover:text-red-600 px-2 py-2 disabled:opacity-40 transition-colors"
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="font-mono text-sm text-muted hover:text-ink px-4 py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || pending}
                className="bg-ink text-surface font-mono text-sm font-medium px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-ink/90 transition-colors"
              >
                {pending ? "Saving…" : isEdit ? "Save" : "Add event"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

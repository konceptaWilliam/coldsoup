// Shared types + date helpers for the group calendar feature.

export type CalendarEvent = {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  start_at: string; // ISO
  end_at: string; // ISO
  all_day: boolean;
  location: string | null;
  color: string;
  created_by: string | null;
  creator?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

// Signature mint — default event color (matches --pastel).
export const DEFAULT_EVENT_COLOR = "#C8E6D5";

// Preset swatches offered in the event form, mint first.
export const EVENT_COLORS = [
  "#C8E6D5", // mint (default)
  "#F6D9B8", // amber
  "#A7C7E7", // blue
  "#E8B7C7", // rose
  "#D6C7E8", // purple
  "#C7C5BC", // gray
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

// Local YYYY-MM-DD for a Date (calendar-cell key, date inputs).
export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Local HH:MM for a Date (time inputs).
export function toHM(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Combine a YYYY-MM-DD date string and a HH:MM time string into a local Date.
export function fromDateTime(ymd: string, hm: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

// Midnight (local) for a YYYY-MM-DD string.
export function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Whether `ymd` (a day cell) falls within an event's [start, end] day span.
export function eventCoversDay(event: CalendarEvent, ymd: string): boolean {
  const start = toYMD(new Date(event.start_at));
  const end = toYMD(new Date(event.end_at));
  return ymd >= start && ymd <= end;
}

// Readable time range for an event chip / detail line.
export function formatEventTime(event: CalendarEvent): string {
  if (event.all_day) return "All day";
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const sameDay = toYMD(start) === toYMD(end);
  const t = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay) return `${t(start)} – ${t(end)}`;
  const dm = (d: Date) => d.toLocaleDateString("en", { month: "short", day: "numeric" });
  return `${dm(start)} ${t(start)} – ${dm(end)} ${t(end)}`;
}

// Pick readable foreground (ink vs surface) for a swatch background.
export function readableInk(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1A1A18" : "#F2EFE8";
}

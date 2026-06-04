import type { TFunction } from "i18next";

// Resolve a day index to its label: a weekday name (weekly mode) or a formatted
// calendar date (dates mode). Ported from the planner's getDayLabel.
export function getDayLabel(dayIndex: number, customDates: string[] | null, t: TFunction): string {
  if (customDates && customDates[dayIndex]) return formatCustomDate(customDates[dayIndex]);
  return t(`smeter.days.${dayIndex}`, { defaultValue: `Day ${dayIndex + 1}` });
}

// Short form for the weekly overview grid.
export function getDayShort(dayIndex: number, customDates: string[] | null, t: TFunction): string {
  if (customDates && customDates[dayIndex]) return formatCustomDate(customDates[dayIndex]);
  return t(`smeter.daysShort.${dayIndex}`, { defaultValue: `D${dayIndex + 1}` });
}

export function formatCustomDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

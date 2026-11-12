// Message timestamp label. Today: "14:32". Yesterday: "Yesterday 14:32".
// Earlier this year: "3 Nov 14:32". Older: "3 Nov 2025 14:32".
// All in the viewer's local time zone.

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatMessageTime(dateStr: string, now: Date = new Date()): string {
  const d = new Date(dateStr);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay(d, now)) return time;

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Yesterday ${time}`;

  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${date} ${time}`;
}

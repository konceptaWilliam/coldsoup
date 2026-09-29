// Pure shaping helpers shared by tRPC routers.

export type UnreadMap = Record<string, { unread: number; urgent: number }>;

export function toUnreadMap(rows: { group_id: string; unread: number; urgent: number }[]): UnreadMap {
  const out: UnreadMap = {};
  for (const r of rows) out[r.group_id] = { unread: Number(r.unread), urgent: Number(r.urgent) };
  return out;
}

/** Items whose group is one of the caller's groups (access filter for batch reads). */
export function accessibleByGroup<T>(
  items: T[],
  groupOf: (item: T) => string | null | undefined,
  groupIds: Set<string>,
): T[] {
  return items.filter((item) => {
    const g = groupOf(item);
    return !!g && groupIds.has(g);
  });
}
